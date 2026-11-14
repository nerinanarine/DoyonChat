import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

type EnterKeyEvent = ReactKeyboardEvent | globalThis.KeyboardEvent;

/**
 * IME 変換確定のための Enter かどうかを判定する。
 * isComposing に加え、一部ブラウザが変換中に返す keyCode 229 も対象にする。
 */
export function isComposingEnter(event: EnterKeyEvent): boolean {
  const native = 'nativeEvent' in event ? event.nativeEvent : event;
  return native.isComposing || native.keyCode === 229;
}
