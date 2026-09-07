// Ambient background: three static blurred colour blobs, nothing else. Pure CSS —
// they cost nothing after first paint.
export default function GridBackground() {
  return (<><div className="ambient a" /><div className="ambient b" /><div className="ambient c" /></>);
}
