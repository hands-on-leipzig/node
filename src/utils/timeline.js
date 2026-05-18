/**
 * Timeline includes a real shipment step (products ordered), not "Kein Versand".
 * @param {unknown[]} steps
 * @returns {boolean}
 */
export function timelineHasShipmentStep(steps) {
  if (!Array.isArray(steps)) return false
  return steps.some((s) => s && s.de === 'Versand' && s.en === 'Shipment')
}
