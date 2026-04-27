/**
 * Per-annotation colour store.
 * We maintain our own UID→colour map because the Cornerstone Tools v1 style
 * API is inconsistent across minor versions. Instead we hook into the
 * ANNOTATION_COMPLETED event to tag new annotations with the current colour,
 * and directly mutate the annotation's `annotationStyle` property which
 * Cornerstone Tools reads during its render pass.
 */

const colorMap = new Map<string, string>()

/** Get the stored colour for an annotation UID, or a default */
export function getColor(uid: string): string {
  return colorMap.get(uid) ?? '#00ff00'
}

/** Store a colour for an annotation UID and apply it to the annotation object */
export function setColor(uid: string, color: string, annotationState: any): void {
  colorMap.set(uid, color)
  applyToAnnotation(uid, color, annotationState)
}

/** Apply colour directly onto the annotation object */
function applyToAnnotation(uid: string, color: string, annotationState: any): void {
  try {
    const ann = annotationState.getAnnotation(uid) as any
    if (!ann) return
    // Cornerstone Tools v1 reads these fields from the annotation object itself
    if (!ann.annotationStyle) ann.annotationStyle = {}
    ann.annotationStyle.color = color
    ann.annotationStyle.colorHighlighted = color
    ann.annotationStyle.colorSelected = color
    ann.annotationStyle.colorLocked = color
  } catch {}
}

/** Re-apply all stored colours (call after any state reload) */
export function reapplyAll(annotationState: any): void {
  for (const [uid, color] of colorMap) {
    applyToAnnotation(uid, color, annotationState)
  }
}

/** Remove a uid from the map */
export function remove(uid: string): void {
  colorMap.delete(uid)
}
