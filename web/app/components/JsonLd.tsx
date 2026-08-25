/**
 * A structured-data block. Rendered as the element it is, with the JSON
 * escaped so a `</script>` inside a title cannot close it; nothing here is
 * executed.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

/** A crumb trail as search engines read it, from the same trail the page shows. */
export function breadcrumbs(trail: { href: string; label: string }[], abs: (p: string) => string) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.label,
      item: abs(c.href),
    })),
  };
}
