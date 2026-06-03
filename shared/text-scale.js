// Schema-field factory for the "Text size" control — spread into a plugin's
// schema().fields. EVERY text-content widget (markdown, rss, news-photos, …)
// uses this ONE definition so the control reads, ranges, and behaves the same
// everywhere: 100% is the auto-scaled baseline (a cqmin clamp that tracks the
// widget box), and the user can push up to 400% to fill a full-slide widget on
// a TV. The widget's own default still comes from its defaults().textScale.
//
// The plugin is responsible for turning the percent into a multiplier — divide
// by 100 and feed it into a CSS variable that a `calc(clamp(…cqmin…) * var())`
// rule consumes. Never set an `em` font-size inline: it resolves against the
// inherited 16px and pins the text to a fixed size that never grows with the
// widget (the bug this control was added to avoid).
export const TEXT_SCALE_MAX = 400;

export function textScaleField(label = 'Text size') {
  return {
    key: 'textScale', type: 'number', label,
    min: 80, max: TEXT_SCALE_MAX, step: 10, slider: true, suffix: '%',
    help: '100% is auto-scaled to the widget, bigger on TVs, smaller on tablets. Push higher to fill a full-slide widget.',
  };
}
