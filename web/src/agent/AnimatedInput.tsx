/** 青穗集 · 共用单行输入：保留原生表单行为，复用对话区的文字光标动效。 */
import { forwardRef, useImperativeHandle, useRef, type InputHTMLAttributes } from "react";
import { ComposerCaret } from "./ComposerCaret";

export const AnimatedInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function AnimatedInput(props, ref) {
  const input = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => input.current!, []);
  return <span className="animated-input">
    <input {...props} ref={input} />
    <ComposerCaret textarea={input} value={String(props.value ?? props.defaultValue ?? "")} />
  </span>;
});
