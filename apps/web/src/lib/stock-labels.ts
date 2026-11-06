import type { ContainerStock } from '@mm/domain';
export function containerName(container: ContainerStock, commercialUnitLabel?: string | null) {
  const label =
    container.kind === 'box' && commercialUnitLabel
      ? commercialUnitLabel
      : (
          {
            box: 'Caja',
            blister: 'Blíster',
            half_box: 'Media caja',
            loose_bin: 'Fruta suelta',
          } as const
        )[container.kind];
  return `${label} · ${container.id.slice(0, 8)}`;
}
