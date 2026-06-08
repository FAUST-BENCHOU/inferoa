import Head from "@docusaurus/Head";
import { useBaseUrlUtils } from "@docusaurus/useBaseUrl";
import { useBlogPost } from "@docusaurus/plugin-content-blog/client";

export default function BlogPostPageMetadata(): JSX.Element {
  const { withBaseUrl } = useBaseUrlUtils();
  const { assets, metadata } = useBlogPost();
  const { title, description, date, tags, authors, frontMatter } = metadata;
  const keywords = frontMatter.keywords;
  const image = assets.image ?? frontMatter.image;
  const pageTitle = frontMatter.title_meta ?? title;
  const pageImage = image ? withBaseUrl(image, { absolute: true }) : undefined;

  return (
    <Head>
      <title>{pageTitle}</title>
      <meta property="og:title" content={pageTitle} />
      <meta name="twitter:title" content={pageTitle} />
      <meta name="description" content={description} />
      <meta property="og:description" content={description} />
      {keywords && (
        <meta
          name="keywords"
          content={Array.isArray(keywords) ? keywords.join(",") : keywords}
        />
      )}
      {pageImage && <meta property="og:image" content={pageImage} />}
      {pageImage && <meta name="twitter:image" content={pageImage} />}
      <meta property="og:type" content="article" />
      <meta property="article:published_time" content={date} />
      {authors.some((author) => author.url) && (
        <meta
          property="article:author"
          content={authors
            .map((author) => author.url)
            .filter(Boolean)
            .join(",")}
        />
      )}
      {tags.length > 0 && (
        <meta
          property="article:tag"
          content={tags.map((tag) => tag.label).join(",")}
        />
      )}
    </Head>
  );
}
