/** 青穗集 · 研究员视图里的求职主线；求职者第一屏不再走这里。 */
import { useState } from "react";
import type { Station } from "../state/loop";
import { rise } from "../state/motion";
import { SuinaiFace } from "./Brand";
import { Ms } from "./Ms";
import { Swap } from "./Swap";

interface Props {
  stations: Station[];
  current: Station | null;
  /** Put the step in the composer and focus it — she still decides to send it. */
  onTake: (goal: string, capability: string) => void;
  /** Only the first screen passes these: the other ways in, kept one tap away. */
  alternatives?: Array<{ goal: string; capability: string; glyph: string }>;
  /** Her one line about how she works. Said once, on the first screen, inside this card. */
  lead?: string | null;
}

/**
 * The loop as the first thing on the screen. Desktop draws the whole track; a phone
 * collapses the same state to the current station plus the dots, so nothing is
 * hidden behind a tap on either side.
 */
export function LoopSpine({ stations, current, onTake, alternatives = [], lead = null }: Props) {
  const [open, setOpen] = useState(false);
  const index = current ? stations.indexOf(current) : stations.length;

  return (
    <section className="spine">
      <div className="spine__head">
        <span className="spine__cap">这一轮走到哪</span>
        <span className="spine__pos">
          <Swap when={current?.key ?? "done"}>
            {current ? `第 ${index + 1} / ${stations.length} 步 · ${current.name}` : "主线都走完了 · 可以开下一轮"}
          </Swap>
        </span>
      </div>

      <ol className="spine__track">
        {stations.map((station, position) => {
          const isNow = station.key === current?.key;
          const state = station.done ? "done" : isNow ? "now" : "next";
          return (
            <li className={`spine__node spine__node--${state}`} key={station.key}>
              <span className="spine__mark">
                {/* The glyph changes when a station lights, and the hint changes with
                    whatever the feed says now — both are content changes, so both
                    animate rather than mutate in place. */}
                <Swap when={state}>
                  <Ms g={station.done ? "check_circle" : station.glyph} size={18} />
                </Swap>
              </span>
              <span className="spine__name">{station.name}</span>
              <span className="spine__hint">
                <Swap when={station.hint}>{station.hint}</Swap>
              </span>
              {position < stations.length - 1 ? <span className="spine__link" /> : null}
            </li>
          );
        })}
      </ol>

      {lead ? (
        <p className="spine__lead card-in">
          <SuinaiFace face="listen" size={26} />
          <span>{lead}</span>
        </p>
      ) : null}

      {current ? (
        <div className="spine__next">
          <button
            className="spine__cta"
            onClick={() => onTake(current.goal, current.capability)}
            title="这句话会填进下面的输入框，你可以先改再发"
          >
            <Swap when={current.key}>
              <span>{`先做这一步：${current.name}`}</span>
            </Swap>
            <Ms g="arrow_forward" size={18} />
          </button>
          {alternatives.length ? (
            <button className="spine__more" onClick={() => setOpen(!open)} aria-expanded={open}>
              <Swap when={open ? "open" : "closed"}>
                <span>{open ? "收起别的问法" : "想换个问法"}</span>
              </Swap>
              <Ms g={open ? "expand_less" : "expand_more"} size={16} />
            </button>
          ) : null}
        </div>
      ) : null}

      {open
        ? alternatives.map((example, position) => (
            <button
              className="spine__alt card-in"
              style={rise(position)}
              key={example.goal}
              onClick={() => onTake(example.goal, example.capability)}
            >
              <Ms g={example.glyph} size={16} />
              <span>{example.goal}</span>
            </button>
          ))
        : null}
    </section>
  );
}
