import { promises as fs } from "node:fs";
import path from "node:path";
import type { JsonObject, OmniEndpointConfig, ToolResult } from "../types.js";
import { endpointApiKey } from "../config/config.js";
import { fail, ok, truncateText } from "../util/limit.js";
import { delay, numberOrDefault, stringField } from "../util/types.js";
import { resolveInside } from "../util/fs.js";
import type { ToolExecutionContext } from "./context.js";

type OmniCapability =
  | "vision"
  | "image_generation"
  | "video_understanding"
  | "video_generation"
  | "audio_understanding"
  | "audio_generation";

export async function visionUnderstanding(args: JsonObject, context: ToolExecutionContext): Promise<ToolResult> {
  return await understanding("vision", args, context, "image_url");
}

export async function videoUnderstanding(args: JsonObject, context: ToolExecutionContext): Promise<ToolResult> {
  return await understanding("video_understanding", args, context, "video_url");
}

export async function audioUnderstanding(args: JsonObject, context: ToolExecutionContext): Promise<ToolResult> {
  return await understanding("audio_understanding", args, context, "audio_url");
}

export async function imageGeneration(args: JsonObject, context: ToolExecutionContext): Promise<ToolResult> {
  return await generation("image_generation", "/images/generations", args, context);
}

export async function videoGeneration(args: JsonObject, context: ToolExecutionContext): Promise<ToolResult> {
  return await videoGenerationJob(args, context);
}

export async function audioGeneration(args: JsonObject, context: ToolExecutionContext): Promise<ToolResult> {
  return await generation("audio_generation", "/audio/generations", args, context);
}

async function understanding(
  capability: OmniCapability,
  args: JsonObject,
  context: ToolExecutionContext,
  inputType: "image_url" | "video_url" | "audio_url",
): Promise<ToolResult> {
  const endpoint = endpointFor(capability, context);
  if (!endpoint.ok) {
    return endpoint.result;
  }
  const inputs = Array.isArray(args.inputs) ? args.inputs.map(String) : [];
  const content: JsonObject[] = [{ type: "text", text: String(args.prompt) }];
  for (const input of inputs) {
    content.push({ type: inputType, [inputType]: { url: await normalizeInput(input, context) } });
  }
  const response = await postJson(endpoint.config, "/chat/completions", {
    model: String(args.model ?? endpoint.config.model),
    messages: [
      {
        role: "user",
        content,
      },
    ],
    temperature: 0,
  });
  if (!response.ok) {
    return fail(`${capability}_failed`, response.error);
  }
  const text = extractChatText(response.json);
  const truncated = truncateText(text, 16_000);
  const resource =
    truncated.truncated || JSON.stringify(response.json).length > 20_000
      ? context.store.putResource(context.session_id, `omni.${capability}`, JSON.stringify(response.json, null, 2), {
          capability,
          model: endpoint.config.model,
        }).uri
      : undefined;
  return {
    ok: true,
    summary: `${capability} completed`,
    data: {
      capability,
      model: endpoint.config.model,
      answer: truncated.text,
      raw_usage: (response.json.usage as JsonObject | undefined) ?? {},
    },
    resource_uri: resource,
  };
}

async function generation(
  capability: OmniCapability,
  apiPath: string,
  args: JsonObject,
  context: ToolExecutionContext,
): Promise<ToolResult> {
  const endpoint = endpointFor(capability, context);
  if (!endpoint.ok) {
    return endpoint.result;
  }
  const body: JsonObject = {
    model: String(args.model ?? endpoint.config.model),
    prompt: String(args.prompt),
  };
  for (const key of ["size", "seed", "duration", "voice"]) {
    if (args[key] !== undefined) {
      body[key] = args[key] as never;
    }
  }
  const response = await postJson(endpoint.config, apiPath, body);
  if (!response.ok) {
    return fail(`${capability}_failed`, response.error);
  }
  const media = extractMedia(response.json);
  const content = JSON.stringify({ capability, request: body, response: response.json }, null, 2);
  const resource = context.store.putResource(context.session_id, `omni.${capability}`, content, {
    capability,
    model: endpoint.config.model,
    media_count: media.length,
  });
  return ok(`${capability} completed with ${media.length} media item(s)`, {
    capability,
    model: endpoint.config.model,
    media: media as never,
    resource_uri: resource.uri,
  });
}

async function videoGenerationJob(args: JsonObject, context: ToolExecutionContext): Promise<ToolResult> {
  const endpoint = endpointFor("video_generation", context);
  if (!endpoint.ok) {
    return endpoint.result;
  }

  const fields: Record<string, string> = {
    model: String(args.model ?? endpoint.config.model),
    prompt: String(args.prompt),
  };
  for (const key of ["seed", "duration", "size", "width", "height", "num_frames", "fps"]) {
    if (args[key] !== undefined) {
      fields[key] = String(args[key]);
    }
  }

  const submitted = await postForm(endpoint.config, "/videos", fields);
  if (!submitted.ok) {
    return fail("video_generation_failed", submitted.error);
  }
  const jobId = stringField(submitted.json.id) ?? stringField(submitted.json.video_id) ?? stringField(submitted.json.job_id);
  if (!jobId) {
    const media = extractMedia(submitted.json);
    const resource = context.store.putResource(
      context.session_id,
      "omni.video_generation",
      JSON.stringify({ capability: "video_generation", request: fields, response: submitted.json }, null, 2),
      { capability: "video_generation", model: endpoint.config.model, media_count: media.length },
    );
    return ok(`video_generation completed with ${media.length} media item(s)`, {
      capability: "video_generation",
      model: endpoint.config.model,
      media: media as never,
      resource_uri: resource.uri,
    });
  }

  const deadline = Date.now() + numberOrDefault(args.timeout_ms, 180_000);
  let statusJson = submitted.json;
  while (Date.now() < deadline) {
    const status = statusText(statusJson);
    if (["completed", "succeeded", "success", "finished"].includes(status)) {
      break;
    }
    if (["failed", "error", "cancelled", "canceled"].includes(status)) {
      return fail("video_generation_failed", `Video job ${jobId} ${status}`, { job_id: jobId, status: statusJson });
    }
    await delay(numberOrDefault(args.poll_ms, 2_000));
    const polled = await getJson(endpoint.config, `/videos/${encodeURIComponent(jobId)}`);
    if (!polled.ok) {
      return fail("video_generation_status_failed", polled.error, { job_id: jobId });
    }
    statusJson = polled.json;
  }

  if (!["completed", "succeeded", "success", "finished"].includes(statusText(statusJson))) {
    return fail("video_generation_timeout", `Video job ${jobId} did not finish before timeout.`, {
      job_id: jobId,
      status: statusJson,
    });
  }

  const content = await getBytes(endpoint.config, `/videos/${encodeURIComponent(jobId)}/content`);
  if (!content.ok) {
    return fail("video_generation_download_failed", content.error, { job_id: jobId, status: statusJson });
  }
  const mediaResource = context.store.putResource(
    context.session_id,
    "omni.video_generation.media",
    content.bytes.toString("base64"),
    {
      capability: "video_generation",
      model: endpoint.config.model,
      job_id: jobId,
      content_type: content.content_type,
      encoding: "base64",
      bytes: content.bytes.length,
    },
  );
  const evidenceResource = context.store.putResource(
    context.session_id,
    "omni.video_generation",
    JSON.stringify({ capability: "video_generation", request: fields, status: statusJson, media_resource: mediaResource.uri }, null, 2),
    { capability: "video_generation", model: endpoint.config.model, job_id: jobId },
  );
  return ok("video_generation completed with 1 media item(s)", {
    capability: "video_generation",
    model: endpoint.config.model,
    job_id: jobId,
    media: [{ resource_uri: mediaResource.uri, content_type: content.content_type, bytes: content.bytes.length }] as never,
    resource_uri: evidenceResource.uri,
  });
}

function endpointFor(capability: OmniCapability, context: ToolExecutionContext):
  | { ok: true; config: OmniEndpointConfig }
  | { ok: false; result: ToolResult } {
  if (!context.config.omni.enabled) {
    return { ok: false, result: fail("omni_disabled", "Omni tools are not enabled in config.") };
  }
  const config = context.config.omni.endpoints[capability];
  if (!config?.base_url || !config.model) {
    return {
      ok: false,
      result: fail("omni_capability_unavailable", `Omni capability ${capability} is not configured with base_url and model.`),
    };
  }
  return { ok: true, config };
}

async function postJson(
  endpoint: OmniEndpointConfig,
  apiPath: string,
  body: JsonObject,
): Promise<{ ok: true; json: JsonObject } | { ok: false; error: string }> {
  const base = endpoint.base_url?.replace(/\/$/, "");
  const apiKey = endpointApiKey(endpoint);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(endpoint.headers ?? {}),
  };
  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }
  try {
    const response = await fetch(`${base}${apiPath}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) {
      return { ok: false, error: `${response.status}: ${text}` };
    }
    return { ok: true, json: text ? (JSON.parse(text) as JsonObject) : {} };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function postForm(
  endpoint: OmniEndpointConfig,
  apiPath: string,
  fields: Record<string, string>,
): Promise<{ ok: true; json: JsonObject } | { ok: false; error: string }> {
  const base = endpoint.base_url?.replace(/\/$/, "");
  const apiKey = endpointApiKey(endpoint);
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.set(key, value);
  }
  const headers: Record<string, string> = { ...(endpoint.headers ?? {}) };
  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }
  try {
    const response = await fetch(`${base}${apiPath}`, {
      method: "POST",
      headers,
      body: form,
    });
    const text = await response.text();
    if (!response.ok) {
      return { ok: false, error: `${response.status}: ${text}` };
    }
    return { ok: true, json: text ? (JSON.parse(text) as JsonObject) : {} };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function getJson(
  endpoint: OmniEndpointConfig,
  apiPath: string,
): Promise<{ ok: true; json: JsonObject } | { ok: false; error: string }> {
  const base = endpoint.base_url?.replace(/\/$/, "");
  const response = await get(endpoint, `${base}${apiPath}`);
  if (!response.ok) {
    return response;
  }
  try {
    return { ok: true, json: response.text ? (JSON.parse(response.text) as JsonObject) : {} };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function getBytes(
  endpoint: OmniEndpointConfig,
  apiPath: string,
): Promise<{ ok: true; bytes: Buffer; content_type: string } | { ok: false; error: string }> {
  const base = endpoint.base_url?.replace(/\/$/, "");
  const apiKey = endpointApiKey(endpoint);
  const headers: Record<string, string> = { ...(endpoint.headers ?? {}) };
  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }
  try {
    const response = await fetch(`${base}${apiPath}`, { headers });
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!response.ok) {
      return { ok: false, error: `${response.status}: ${bytes.toString("utf8")}` };
    }
    return {
      ok: true,
      bytes,
      content_type: response.headers.get("content-type") ?? "application/octet-stream",
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function get(
  endpoint: OmniEndpointConfig,
  url: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const apiKey = endpointApiKey(endpoint);
  const headers: Record<string, string> = { ...(endpoint.headers ?? {}) };
  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }
  try {
    const response = await fetch(url, { headers });
    const text = await response.text();
    if (!response.ok) {
      return { ok: false, error: `${response.status}: ${text}` };
    }
    return { ok: true, text };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function normalizeInput(input: string, context: ToolExecutionContext): Promise<string> {
  if (/^(https?:|data:|file:)/.test(input)) {
    return input;
  }
  const file = resolveInside(context.workspace.root, input);
  const bytes = await fs.readFile(file);
  return `data:${mimeType(file)};base64,${bytes.toString("base64")}`;
}

function mimeType(file: string): string {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".webm") return "video/webm";
  if (ext === ".wav") return "audio/wav";
  if (ext === ".mp3") return "audio/mpeg";
  return "application/octet-stream";
}

function extractChatText(json: JsonObject): string {
  const choices = json.choices as JsonObject[] | undefined;
  const message = choices?.[0]?.message as JsonObject | undefined;
  const content = message?.content;
  if (typeof content === "string") {
    return content;
  }
  return JSON.stringify(json);
}

function extractMedia(json: JsonObject): JsonObject[] {
  const data = json.data as JsonObject[] | undefined;
  if (Array.isArray(data)) {
    return data.map((item) => ({
      url: item.url,
      b64_json: typeof item.b64_json === "string" ? `[base64:${item.b64_json.length} chars]` : undefined,
      revised_prompt: item.revised_prompt,
    }));
  }
  const output = json.output as JsonObject[] | undefined;
  if (Array.isArray(output)) {
    return output;
  }
  return [];
}

function statusText(json: JsonObject): string {
  const status = stringField(json.status) ?? stringField(json.state) ?? stringField((json.data as JsonObject | undefined)?.status);
  return (status ?? "queued").toLowerCase();
}
