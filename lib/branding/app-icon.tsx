export function CompassIcon() {
  return (
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#ad1d39",
      }}
    >
      <svg width="65%" height="65%" viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r="43"
          stroke="white"
          strokeWidth="3"
          fill="none"
        />
        <path
          d="M50 12 59 41 88 50 59 59 50 88 41 59 12 50 41 41Z"
          fill="white"
        />
        <circle cx="50" cy="50" r="7" fill="#ad1d39" />
      </svg>
    </div>
  );
}
