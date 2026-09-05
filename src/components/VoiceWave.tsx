const BARS = Array.from({ length: 22 }, (_, i) => i);

type Props = {
  /** 0~1, 마이크 RMS 또는 말 조각 활동 */
  level: number;
};

/** 음량(또는 말 활동)에 따라 막대 높이가 바뀜. 장식용 CSS 루프와 분리. */
export default function VoiceWave({ level }: Props) {
  const active = level > 0.04;
  return (
    <div
      className={`wave${active ? " reactive" : " idle"}`}
      aria-hidden
    >
      {BARS.map((i) => {
        const sway = Math.sin(i * 0.55 + level * 6) * 0.35 + 0.65;
        const mid = Math.abs(i - (BARS.length - 1) / 2) / (BARS.length / 2);
        const envelope = 1 - mid * 0.35;
        const height = active
          ? Math.round(7 + level * sway * envelope * 40)
          : 7 + (i % 3);
        return <i key={i} style={{ height: `${height}px` }} />;
      })}
    </div>
  );
}
