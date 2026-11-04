import type { ContainerStock } from '@mm/domain';
export function containerName(container: ContainerStock) {
  return `${({ box: 'Caja', blister: 'Blíster', half_box: 'Media caja', loose_bin: 'Fruta suelta' } as const)[container.kind]} · ${container.id.slice(0, 8)}`;
}
