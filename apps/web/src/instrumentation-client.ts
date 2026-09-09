// Runs before any application or dependency code on the client — the hook
// Next provides for exactly this. Keep it to side-effect imports that must
// precede everything else; anything heavier belongs in a component.
import './polyfills'
