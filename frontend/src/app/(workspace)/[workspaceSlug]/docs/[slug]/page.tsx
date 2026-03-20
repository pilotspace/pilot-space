/**
 * Docs Detail Route — renders a single documentation page from markdown.
 *
 * Route: /[workspaceSlug]/docs/[slug]
 * Content is loaded from the build-time manifest (no server-side file I/O).
 * Headings are extracted for table of contents.
 *
 * generateStaticParams enumerates all 6 valid doc slugs so that static export
 * (NEXT_TAURI=true) can pre-generate HTML shells for each docs page.
 */

import { notFound } from 'next/navigation';
import { DocsPage, docsBySlug } from '@/features/docs';
import { extractHeadings } from '@/features/docs/lib/markdown-headings';
import { docsManifest } from '@/features/docs/lib/docs-manifest';

interface PageProps {
  params: Promise<{ workspaceSlug: string; slug: string }>;
}

export function generateStaticParams() {
  // Return all known doc slugs. The workspaceSlug segment is provided by the
  // parent [workspaceSlug] layout's generateStaticParams (placeholder '_').
  return Array.from(docsBySlug.keys()).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const doc = docsBySlug.get(slug);
  if (!doc) return { title: 'Not Found | Pilot Space' };

  return {
    title: `${doc.title} | Docs | Pilot Space`,
    description: doc.description,
  };
}

export default async function DocsDetailPage({ params }: PageProps) {
  const { slug } = await params;

  const doc = docsBySlug.get(slug);
  if (!doc) {
    notFound();
  }

  const content = docsManifest[doc.file];
  if (!content) {
    notFound();
  }

  const headings = extractHeadings(content);

  return <DocsPage slug={slug} content={content} headings={headings} />;
}
