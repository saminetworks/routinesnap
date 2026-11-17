/**
 * Renders a JSON-LD <script> tag. The data is built by the helpers in
 * src/lib/seo.ts from the same strings the page already shows, so the
 * structured data always matches the visible content.
 */
export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
