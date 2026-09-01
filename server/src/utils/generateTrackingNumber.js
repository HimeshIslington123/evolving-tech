export function generateTrackingNumber() {
  return `RC-${Date.now()}-${Math.floor(
    Math.random() * 1000
  )
    .toString()
    .padStart(3, "0")}`;
}