export function createEngineContext(params) {
  return {
    state: params.state,
    ai: params.ai || {},
    collisions: params.collisions || {},
    render: params.render || {},
    audio: params.audio || {},
    constants: params.constants || {}
  };
}
