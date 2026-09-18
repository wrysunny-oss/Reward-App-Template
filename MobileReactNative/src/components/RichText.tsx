import React, {useMemo} from 'react';
import {Linking, useWindowDimensions} from 'react-native';
import RenderHtml, {MixedStyleRecord} from 'react-native-render-html';

import {API_ORIGIN} from '../api/client';
import {colors, spacing, typography} from '../theme';

const tagsStyles: MixedStyleRecord = {
  body: {color: colors.muted, ...typography.body},
  p: {marginBottom: spacing.md, marginTop: 0},
  h1: {color: colors.text, fontSize: 24, lineHeight: 32, fontWeight: '700', marginBottom: spacing.lg, marginTop: spacing.sm},
  h2: {color: colors.text, fontSize: 20, lineHeight: 28, fontWeight: '700', marginBottom: spacing.md, marginTop: spacing.lg},
  h3: {color: colors.text, fontSize: 17, lineHeight: 25, fontWeight: '700', marginBottom: spacing.sm, marginTop: spacing.md},
  h4: {color: colors.text, fontSize: 15, lineHeight: 23, fontWeight: '700', marginBottom: spacing.sm, marginTop: spacing.md},
  strong: {color: colors.text, fontWeight: '700'},
  b: {color: colors.text, fontWeight: '700'},
  em: {fontStyle: 'italic'},
  i: {fontStyle: 'italic'},
  u: {textDecorationLine: 'underline'},
  s: {textDecorationLine: 'line-through'},
  a: {color: colors.primary, textDecorationLine: 'underline'},
  blockquote: {backgroundColor: colors.surfaceAlt, borderLeftColor: colors.primary, borderLeftWidth: 3, color: colors.muted, marginBottom: spacing.md, marginLeft: 0, paddingHorizontal: spacing.md, paddingVertical: spacing.sm},
  ul: {marginBottom: spacing.md, marginTop: 0, paddingLeft: spacing.sm},
  ol: {marginBottom: spacing.md, marginTop: 0, paddingLeft: spacing.sm},
  li: {marginBottom: spacing.xs},
  code: {backgroundColor: colors.surfaceAlt, color: colors.primary, fontFamily: 'monospace', fontSize: 13},
  pre: {backgroundColor: colors.surfaceAlt, borderRadius: 8, color: colors.text, marginBottom: spacing.md, padding: spacing.md},
  hr: {backgroundColor: colors.border, height: 1, marginBottom: spacing.lg, marginTop: spacing.md},
  img: {borderRadius: 10, marginBottom: spacing.md, marginTop: spacing.sm},
};

const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

/** 兼容升级前已经保存的纯文本，同时让新内容按 Tiptap HTML 渲染。 */
function normalizeContent(value: string) {
  if (/<[a-z][\s\S]*>/i.test(value)) return value;
  return `<p>${escapeHtml(value).replaceAll('\n', '<br />')}</p>`;
}

export function RichText({content}: {content: string}) {
  const {width} = useWindowDimensions();
  const source = useMemo(() => ({html: normalizeContent(content), baseUrl: API_ORIGIN}), [content]);

  return (
    <RenderHtml
      baseStyle={tagsStyles.body}
      contentWidth={Math.max(240, width - 64)}
      defaultTextProps={{selectable: true}}
      enableExperimentalMarginCollapsing
      ignoredDomTags={['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button']}
      renderersProps={{
        a: {
          onPress: (_event, href) => {
            if (/^(?:https?:|mailto:|tel:)/i.test(href)) Linking.openURL(href).catch(() => undefined);
          },
        },
      }}
      source={source}
      tagsStyles={tagsStyles}
    />
  );
}
