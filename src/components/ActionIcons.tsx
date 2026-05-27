import type { SVGProps } from 'react';

const base = 'h-4 w-4 shrink-0';

function Icon(props: SVGProps<SVGSVGElement>) {
  return <svg {...props} />;
}

export function PlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon className={props.className || base} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden {...props}>
      <path strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </Icon>
  );
}

export function EyeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon className={props.className || base} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden {...props}>
      <path strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5s8.268 2.943 9.542 7c-1.274 4.057-5.065 7-9.542 7s-8.268-2.943-9.542-7z" />
    </Icon>
  );
}

export function EditIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon className={props.className || base} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden {...props}>
      <path strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M11 5h7m-7 0v7m0-7L4 16v4h4l7-7" />
    </Icon>
  );
}

export function TrashIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon className={props.className || base} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden {...props}>
      <path strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2" />
    </Icon>
  );
}

export function PrinterIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon className={props.className || base} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden {...props}>
      <path strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M6 9V4h12v5M6 18h12v2H6v-2Zm-2-6h16a2 2 0 012 2v4H4v-4a2 2 0 012-2Zm3-2h0" />
      <path strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M17 14h.01" />
    </Icon>
  );
}

export function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon className={props.className || base} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden {...props}>
      <path strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M20 6L9 17l-5-5" />
    </Icon>
  );
}

export function XIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon className={props.className || base} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden {...props}>
      <path strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
    </Icon>
  );
}

export function DollarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon className={props.className || base} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden {...props}>
      <path strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M12 3v18m4-14.5c0-1.933-1.79-3.5-4-3.5s-4 1.567-4 3.5S9.79 8 12 8s4 1.567 4 3.5S14.21 15 12 15s-4 1.567-4 3.5S9.79 22 12 22s4-1.567 4-3.5" />
    </Icon>
  );
}

export function SeatIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon className={props.className || base} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden {...props}>
      <path strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M8 12h8a2 2 0 012 2v5H6v-5a2 2 0 012-2Zm1-2V8a3 3 0 116 0v2" />
      <path strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M6 19v2m12-2v2" />
    </Icon>
  );
}

export function ToggleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon className={props.className || base} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden {...props}>
      <path strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M7 12h10" />
      <path strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M15 8l4 4-4 4" />
      <path strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M9 8l-4 4 4 4" />
    </Icon>
  );
}

export function HandIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon className={props.className || base} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden {...props}>
      <path strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M10 9V3h8v6m0 0v8a2 2 0 01-2 2h-4a2 2 0 01-2-2v-8m4 0h4v-6H10v6" />
      <path strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M2 10a1 1 0 011-1h6m0 0H3" />
    </Icon>
  );
}
