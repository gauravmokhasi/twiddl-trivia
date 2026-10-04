'use client';

import { useState } from 'react';
import {
  PULSE_MAX_SCORE,
  PULSE_WEEKDAY_LABELS,
  buildPulseMonthLabels,
  buildPulseWeeks,
  describePulseDay,
  pulseAriaLabel,
  type PulseDay,
} from '@/lib/pulse';

type Props = {
  activity: PulseDay[];
};

/**
 * Twiddl Pulse shades. One brand hue (violet) with progressively stronger opacity for 1-5, plus a
 * separate subdued teal for days where only other people answered this user's questions.
 */
const ACTIVE_SHADES = [
  'rgba(255,255,255,0.055)', // 0: inactive, deliberately quiet
  'rgba(139,92,246,0.26)',
  'rgba(139,92,246,0.44)',
  'rgba(139,92,246,0.64)',
  'rgba(139,92,246,0.84)',
  '#8b5cf6',
];

const PASSIVE_SHADE = 'rgba(45,212,191,0.5)';

function shadeFor(day: PulseDay) {
  return day.passiveOnly ? PASSIVE_SHADE : ACTIVE_SHADES[day.score] ?? ACTIVE_SHADES[0];
}

export default function TwiddlPulse({ activity }: Props) {
  const [openDate, setOpenDate] = useState<string | null>(null);
  const weeks = buildPulseWeeks(activity);
  const monthLabels = buildPulseMonthLabels(weeks);
  const openDay = activity.find((day) => day.date === openDate) ?? null;
  const openDetail = openDay ? describePulseDay(openDay) : null;

  return (
    <section className="card p-5 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-bold text-zinc-100">Twiddl Pulse</h3>
        <span className="text-xs text-zinc-500">Activity over the last month</span>
      </div>

      <div
        className="mt-5 overflow-x-auto pb-1"
        onMouseLeave={() => setOpenDate(null)}
      >
        <div className="flex min-w-max gap-2">
          {/*
            Row labels sit outside the scrolling week grid but share its pitch (11px cells, 3px
            gaps), so a label always lines up with its weekday. The top padding clears the month row.
          */}
          <div className="flex flex-col gap-[3px] pt-[15px]" aria-hidden>
            {PULSE_WEEKDAY_LABELS.map((label) => (
              <span key={label} className="h-[11px] text-[10px] leading-[11px] text-zinc-500">{label}</span>
            ))}
          </div>

          <div>
            {/* Month headings: one cell-wide slot per week column keeps them aligned to the grid. */}
            <div className="flex gap-[3px]" aria-hidden>
              {monthLabels.map((label, index) => (
                <span key={index} className="h-[12px] w-[11px] text-[10px] leading-[12px] text-zinc-500">{label}</span>
              ))}
              {/* Room for the final heading to overflow without adding a scrollbar. */}
              <span className="h-[12px] w-[16px]" />
            </div>

            <div className="mt-[3px] flex gap-[3px]">
              {weeks.map((week, weekIndex) => (
                <div key={weekIndex} className="flex flex-col gap-[3px]">
                  {week.map((day, dayIndex) => {
                    if (!day) {
                      return <span key={dayIndex} aria-hidden className="h-[11px] w-[11px]" />;
                    }

                    const isOpen = openDate === day.date;

                    return (
                      <button
                        key={day.date}
                        type="button"
                        aria-label={pulseAriaLabel(day)}
                        aria-pressed={isOpen}
                        onMouseEnter={() => setOpenDate(day.date)}
                        onFocus={() => setOpenDate(day.date)}
                        onClick={() => setOpenDate(isOpen ? null : day.date)}
                        className="h-[11px] w-[11px] shrink-0 rounded-full transition hover:ring-2 hover:ring-violet-300/40 focus:outline-none focus:ring-2 focus:ring-violet-300/60"
                        style={{
                          backgroundColor: shadeFor(day),
                          boxShadow: day.score === 0 && !day.passiveOnly ? 'inset 0 0 0 1px rgba(255,255,255,0.06)' : undefined,
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/*
        Day detail sits under the grid rather than floating over it: the grid scrolls horizontally on
        small screens, and a floating tooltip would be clipped by that scroll container. The height is
        reserved so hovering never shifts the layout.
      */}
      <div className="mt-4 min-h-[1.25rem] text-xs leading-5" aria-live="polite">
        {openDay && openDetail ? (
          <p className="text-zinc-400">
            <span className="font-semibold text-zinc-200">{openDetail.date}</span>
            {openDetail.rows.length > 0
              ? openDetail.rows.map((row) => <span key={row}>{` · ${row}`}</span>)
              : <span> · No activity</span>}
          </p>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
        <span className="flex items-center gap-2">
          <span>Low</span>
          {Array.from({ length: PULSE_MAX_SCORE }, (_, index) => index + 1).map((level) => (
            <span
              key={level}
              aria-hidden
              className="h-[9px] w-[9px] rounded-full"
              style={{ backgroundColor: ACTIVE_SHADES[level] }}
            />
          ))}
          <span>High</span>
        </span>

        {/* Days whose only activity was other people answering this member's questions. */}
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-[9px] w-[9px] rounded-full"
            style={{ backgroundColor: PASSIVE_SHADE }}
          />
          <span>Answers received</span>
        </span>
      </div>
    </section>
  );
}