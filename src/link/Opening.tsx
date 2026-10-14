import "../ui";

/** The bare ground, as the pages show while they load, with the wait announced to screen readers. */
export function Opening() {
  return (
    <div className="ui library-link">
      <p className="visually-hidden" role="status">
        Opening your library…
      </p>
    </div>
  );
}
