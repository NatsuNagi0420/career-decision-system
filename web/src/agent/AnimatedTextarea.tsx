/** 青穗集 · 共用多行输入：保留原生表单与引用行为，统一复用文字光标动效。 */
import { forwardRef, useImperativeHandle, useRef, type TextareaHTMLAttributes } from "react";
import { ComposerCaret } from "./ComposerCaret";

export const AnimatedTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function AnimatedTextarea(props, ref) {
  const input = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => input.current!, []);
  return <span className="animated-textarea">
    <textarea {...props} ref={input} />
    <ComposerCaret textarea={input} value={String(props.value ?? props.defaultValue ?? "")} />
  </span>;
});
