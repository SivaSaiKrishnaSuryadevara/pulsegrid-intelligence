/**
 * White-label client pitch deck, built strictly from @react-pdf/renderer
 * primitives (Document/Page/View/Text/Image + StyleSheet — no HTML, no
 * Tailwind, no CSS shorthand; react-pdf's layout engine is Yoga/React
 * Native-style, so borders are `borderXWidth`/`borderXColor`/`borderXStyle`
 * as separate properties, not a `border` shorthand).
 *
 * This file carries no 'use client' or 'use server' directive. It is meant
 * to be rendered exactly one way: passed to `renderToBuffer()` inside a
 * Route Handler (see `src/app/api/export-roster-pdf/route.ts`), which runs
 * purely server-side and is never bundled for the browser, so there's no
 * SSR conflict on that path. The constraint to watch for is a *page*
 * importing this module directly — @react-pdf/renderer's browser-facing
 * exports (`PDFViewer`, `PDFDownloadLink`) touch `document`/`window`, so a
 * future in-app PDF preview must reach this component through
 * `next/dynamic(() => import('./client-pitch-sheet'), { ssr: false })`
 * rather than a static top-level import in a page or layout.
 */

import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

export interface PitchSheetCreator {
  id: string;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  metroLabel: string;
  languages: string[];
  followerCount: number | null;
  engagementRate: number | null;
  avgReelViews: number | null;
  estMinimumRateUsd: number | null;
  estMaximumRateUsd: number | null;
  culturalFitBullets: string[];
  availabilityLabel: string;
  activeExclusivity: { brandName: string; categorySlug: string; daysRemaining: number } | null;
}

export interface ClientPitchSheetProps {
  agencyName: string;
  agencyLogoUrl: string | null;
  clientName: string;
  campaignTitle: string;
  generatedDateLabel: string;
  creators: PitchSheetCreator[];
}

const CREATORS_PER_PAGE = 6; // 2 columns x 3 rows, sized to fit one A4 page with header/footer

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 32,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#111827',
    backgroundColor: '#FFFFFF',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
    paddingBottom: 14,
    borderBottomWidth: 2,
    borderBottomColor: '#E5E7EB',
    borderBottomStyle: 'solid',
  },
  agencyLogo: {
    width: 96,
    height: 32,
    objectFit: 'contain',
    marginBottom: 6,
  },
  agencyName: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
  },
  metaBlock: {
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  campaignTitle: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 3,
  },
  generatedDate: {
    fontSize: 8,
    color: '#6B7280',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  card: {
    width: '48%',
    marginBottom: 14,
    padding: 10,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#E5E7EB',
    borderRadius: 4,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    objectFit: 'cover',
    marginRight: 8,
  },
  avatarFallback: {
    width: 34,
    height: 34,
    borderRadius: 17,
    marginRight: 8,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#4338CA',
  },
  nameBlock: {
    flexDirection: 'column',
    flexGrow: 1,
  },
  displayName: {
    fontSize: 10.5,
    fontFamily: 'Helvetica-Bold',
  },
  handleLine: {
    fontSize: 8,
    color: '#6B7280',
    marginTop: 1,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  tag: {
    fontSize: 7,
    paddingVertical: 2,
    paddingHorizontal: 5,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    color: '#374151',
    marginRight: 4,
    marginBottom: 4,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    borderTopStyle: 'solid',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    borderBottomStyle: 'solid',
  },
  metricCell: {
    flexDirection: 'column',
    alignItems: 'center',
    flexGrow: 1,
  },
  metricLabel: {
    fontSize: 6,
    color: '#9CA3AF',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
  },
  bulletsBlock: {
    marginBottom: 8,
  },
  bulletLine: {
    fontSize: 7.5,
    marginBottom: 2,
    color: '#374151',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  availabilityChip: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
    color: '#047857',
  },
  exclusivityNote: {
    fontSize: 7,
    color: '#B91C1C',
    marginTop: 6,
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 32,
    right: 32,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7,
    color: '#9CA3AF',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    borderTopStyle: 'solid',
  },
});

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function formatCompact(value: number | null): string {
  if (value === null) return '—';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function formatRate(min: number | null, max: number | null): string {
  if (min === null && max === null) return '—';
  const fmt = (n: number) => `$${formatCompact(n)}`;
  if (min !== null && max !== null) return min === max ? fmt(min) : `${fmt(min)}–${fmt(max)}`;
  return fmt((min ?? max) as number);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase());
  return letters.join('') || '★';
}

export function ClientPitchSheet({
  agencyName,
  agencyLogoUrl,
  clientName,
  campaignTitle,
  generatedDateLabel,
  creators,
}: ClientPitchSheetProps) {
  const pages = chunk(creators, CREATORS_PER_PAGE);
  const pageList = pages.length > 0 ? pages : [[]];

  return (
    <Document title={`${campaignTitle} — ${agencyName}`} author={agencyName}>
      {pageList.map((pageCreators, pageIndex) => (
        <Page key={pageIndex} size="A4" style={styles.page}>
          <View style={styles.headerRow}>
            <View>
              {agencyLogoUrl ? (
                // eslint-disable-next-line jsx-a11y/alt-text -- this is @react-pdf/renderer's Image (a PDF layout primitive), not next/image or an HTML <img>; it has no alt prop, PDF accessibility works via PDF/UA tagging instead
                <Image src={agencyLogoUrl} style={styles.agencyLogo} />
              ) : (
                <Text style={styles.agencyName}>{agencyName}</Text>
              )}
            </View>
            <View style={styles.metaBlock}>
              <Text style={styles.campaignTitle}>{campaignTitle}</Text>
              <Text style={styles.generatedDate}>Generated {generatedDateLabel}</Text>
            </View>
          </View>

          <View style={styles.grid}>
            {pageCreators.map((creator) => (
              <View key={creator.id} style={styles.card} wrap={false}>
                <View style={styles.cardHeaderRow}>
                  {creator.avatarUrl ? (
                    // eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image, not an HTML <img>; see note above
                    <Image src={creator.avatarUrl} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.avatarFallbackText}>{initials(creator.displayName)}</Text>
                    </View>
                  )}
                  <View style={styles.nameBlock}>
                    <Text style={styles.displayName}>{creator.displayName}</Text>
                    <Text style={styles.handleLine}>
                      @{creator.handle} • {creator.metroLabel}
                    </Text>
                  </View>
                </View>

                {creator.languages.length > 0 && (
                  <View style={styles.tagsRow}>
                    {creator.languages.map((language) => (
                      <Text key={language} style={styles.tag}>
                        {language}
                      </Text>
                    ))}
                  </View>
                )}

                <View style={styles.metricsRow}>
                  <View style={styles.metricCell}>
                    <Text style={styles.metricLabel}>Followers</Text>
                    <Text style={styles.metricValue}>{formatCompact(creator.followerCount)}</Text>
                  </View>
                  <View style={styles.metricCell}>
                    <Text style={styles.metricLabel}>ER%</Text>
                    <Text style={styles.metricValue}>
                      {creator.engagementRate !== null ? `${creator.engagementRate.toFixed(1)}%` : '—'}
                    </Text>
                  </View>
                  <View style={styles.metricCell}>
                    <Text style={styles.metricLabel}>Avg Views</Text>
                    <Text style={styles.metricValue}>{formatCompact(creator.avgReelViews)}</Text>
                  </View>
                  <View style={styles.metricCell}>
                    <Text style={styles.metricLabel}>Est. Rate</Text>
                    <Text style={styles.metricValue}>{formatRate(creator.estMinimumRateUsd, creator.estMaximumRateUsd)}</Text>
                  </View>
                </View>

                {creator.culturalFitBullets.length > 0 && (
                  <View style={styles.bulletsBlock}>
                    {creator.culturalFitBullets.map((bullet, index) => (
                      <Text key={index} style={styles.bulletLine}>
                        • {bullet}
                      </Text>
                    ))}
                  </View>
                )}

                <View style={styles.statusRow}>
                  <Text style={styles.availabilityChip}>{creator.availabilityLabel}</Text>
                </View>

                {creator.activeExclusivity && (
                  <Text style={styles.exclusivityNote}>
                    Active exclusivity: {creator.activeExclusivity.brandName} ({creator.activeExclusivity.categorySlug}) —{' '}
                    {creator.activeExclusivity.daysRemaining}d remaining
                  </Text>
                )}
              </View>
            ))}
          </View>

          <View style={styles.footer} fixed>
            <Text>Prepared exclusively for {clientName} • Confidential Talent Roster</Text>
            <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
          </View>
        </Page>
      ))}
    </Document>
  );
}
