// How a visual-media widget fills its box. The three object-fit keywords
// (cover / contain / fill) behave identically on <img> and <video>, so every
// media widget offers the SAME three — a user who picks "Fill" on an image
// finds it on video, the gallery and a webcam stream too. Centralised here
// (like themeField / colorOverrideFields) so the option set can't drift per
// widget again. pdf's fit (page / width) is a DIFFERENT knob — document layout,
// not box-fill — and deliberately stays local to that plugin.

const FITS = ['cover', 'contain', 'fill'];

// Return into a plugin's schema().fields. One definition → identical labels and
// option order across every media widget.
export function mediaFitField(label = 'Fit') {
  return { key: 'fit', type: 'select', label, options: [
    { value: 'cover',   label: 'Cover (fill, may crop)' },
    { value: 'contain', label: 'Contain (letterbox)' },
    { value: 'fill',    label: 'Fill (stretch)' },
  ] };
}

// CSS object-fit value for an <img>/<video> element. Whitelisted so a stale or
// unknown stored value can never inject arbitrary CSS; unknown → 'contain'
// (safe letterbox that shows the whole frame without cropping).
export function objectFitValue(fit) {
  return FITS.includes(fit) ? fit : 'contain';
}

// background-size equivalent for widgets that paint the media as a CSS
// background (image's focal-crop layer, the gallery's Ken Burns layer). 'fill'
// has no background-size keyword, so it maps to an explicit '100% 100%'
// stretch; unknown → 'cover'.
export function backgroundSizeValue(fit) {
  if (fit === 'contain') return 'contain';
  if (fit === 'fill') return '100% 100%';
  return 'cover';
}
