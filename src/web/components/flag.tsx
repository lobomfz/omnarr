import {
  BG,
  BR,
  CN,
  CZ,
  DE,
  DK,
  ES,
  FI,
  FR,
  GB,
  HR,
  HU,
  IT,
  JP,
  KR,
  NL,
  NO,
  PL,
  RO,
  RS,
  RU,
  SE,
  SI,
} from 'country-flag-icons/react/3x2'

import { cn } from '@/web/lib/cn'

const LANG_FLAG: Record<string, typeof GB | undefined> = {
  en: GB,
  eng: GB,
  pt: BR,
  por: BR,
  es: ES,
  spa: ES,
  fr: FR,
  fra: FR,
  fre: FR,
  de: DE,
  deu: DE,
  ger: DE,
  nl: NL,
  nld: NL,
  dut: NL,
  it: IT,
  ita: IT,
  da: DK,
  dan: DK,
  no: NO,
  nor: NO,
  nob: NO,
  nno: NO,
  ja: JP,
  jpn: JP,
  ko: KR,
  kor: KR,
  zh: CN,
  zho: CN,
  chi: CN,
  ru: RU,
  rus: RU,
  sv: SE,
  swe: SE,
  fi: FI,
  fin: FI,
  pl: PL,
  pol: PL,
  hu: HU,
  hun: HU,
  cs: CZ,
  ces: CZ,
  cze: CZ,
  ro: RO,
  ron: RO,
  rum: RO,
  hr: HR,
  hrv: HR,
  sr: RS,
  srp: RS,
  sl: SI,
  slv: SI,
  bg: BG,
  bul: BG,
}

export function Flag(props: {
  code: string
  size?: 'sm' | 'md'
  showLabel?: boolean
  className?: string
}) {
  const size = props.size ?? 'sm'
  const code = props.code.slice(0, 3).toLowerCase()
  const FlagSvg = LANG_FLAG[code] ?? LANG_FLAG[code.slice(0, 2)]
  const swatchClass = size === 'md' ? 'w-[18px] h-[12px]' : 'w-[15px] h-[10px]'

  return (
    <span
      data-component="flag"
      data-lang={code}
      className={cn('inline-flex items-center gap-1.5', props.className)}
    >
      <span
        className={cn(
          swatchClass,
          'relative rounded-[2px] overflow-hidden shadow-[inset_0_0_0_1px_rgba(0,0,0,0.3)]'
        )}
      >
        {!!FlagSvg && <FlagSvg className="w-full h-full block" />}
        {!FlagSvg && <span className="w-full h-full block bg-[#554E48]" />}
      </span>
      {props.showLabel !== false && (
        <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
          {code}
        </span>
      )}
    </span>
  )
}
