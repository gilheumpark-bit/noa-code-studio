/**
 * @eh/shared-types — types shared by quill-engine, quill-cli, and desktop.
 *
 * Rule: Types only. No runtime code, no Node API imports.
 */
export function isLocalProvider(p) {
    return p === 'ollama' || p === 'lmstudio';
}
