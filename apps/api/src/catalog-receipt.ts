import { BadRequestException, ConflictException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import Decimal from 'decimal.js';
import {
  getHabitualTemplates,
  getHabitualTemplate,
  catalogNameKey,
  habitualPacking,
  habitualPackingIssue,
  type ReceiptProduct,
  type ReceiptPacking,
} from '../../../packages/domain/src/index';

export type ReceiptRule = {
  id: string;
  variant_id: string;
  version: number;
  confirmation_status: 'pending' | 'confirmed';
  packing_model: ReceiptPacking['packingModel'];
  half_preparation: ReceiptPacking['halfPreparation'];
  allowed_presentations: ReceiptPacking['allowedPresentations'];
  blisters_per_box: number | null;
  box_weight_kg: string | null;
  commercial_unit_label: string | null;
  fruit: string;
  variety: string | null;
  caliber: string | null;
  commercial_line: string;
};
const selectRule = `select r.*,f.name as fruit,v.name as variety,c.label as caliber,p.commercial_line
 from packing_rules r join product_variants p on p.id=r.variant_id join fruits f on f.id=p.fruit_id
 left join varieties v on v.id=p.variety_id left join calibers c on c.id=p.caliber_id`;
function matches(rule: ReceiptRule, packing: ReceiptPacking) {
  return (
    rule.packing_model === packing.packingModel &&
    (rule.commercial_unit_label ?? null) === (packing.commercialUnitLabel ?? null) &&
    rule.half_preparation === packing.halfPreparation &&
    rule.blisters_per_box === packing.blistersPerBox &&
    [...rule.allowed_presentations].sort().join(',') ===
      [...packing.allowedPresentations].sort().join(',') &&
    (rule.box_weight_kg === null
      ? packing.boxWeightKg === null
      : packing.boxWeightKg !== null && new Decimal(rule.box_weight_kg).eq(packing.boxWeightKg))
  );
}
async function audit(
  client: PoolClient,
  id: string,
  before: unknown,
  after: unknown,
  actor: string,
  key: string,
  templateVersion: 'v4.2' | 'v4.5' = 'v4.2',
) {
  await client.query(
    `insert into audit_events(entity_type,entity_id,action,before,after,actor,request_id)
    values('packing_rules',$1,'quick_receipt_materialization',$2::jsonb,$3::jsonb,$4,$5)`,
    [
      id,
      before === null ? null : JSON.stringify(before),
      JSON.stringify({ ...(after as object), templateVersion }),
      actor,
      key,
    ],
  );
}
async function confirmPending(
  client: PoolClient,
  rule: ReceiptRule,
  packing: ReceiptPacking | undefined,
  actor: string,
  key: string,
  templateVersion: 'v4.2' | 'v4.5' = 'v4.2',
) {
  const template = getHabitualTemplates(templateVersion).find(
    (t) =>
      catalogNameKey(t.fruitName) === catalogNameKey(rule.fruit) &&
      ((t.commercialLine || 'Estándar') === rule.commercial_line || t.requiresCommercialUnit),
  );
  if (rule.confirmation_status === 'confirmed') {
    // A missing name may be completed only after explicit review and before the
    // first lot. Existing lots retain their own immutable commercial identity.
    if (
      templateVersion === 'v4.5' &&
      packing?.commercialUnitLabel &&
      !rule.commercial_unit_label &&
      matches(rule, { ...packing, commercialUnitLabel: null })
    ) {
      if (
        (await client.query('select 1 from lots where packing_rule_id=$1 limit 1', [rule.id]))
          .rowCount
      )
        throw new ConflictException(
          'Este producto ya tiene historia. Revisa su unidad comercial en el catálogo antes de recibir.',
        );
      const result = (
        await client.query(
          `update packing_rules set commercial_unit_label=$2,version=version+1,updated_at=now() where id=$1 returning *`,
          [rule.id, packing.commercialUnitLabel],
        )
      ).rows[0];
      const after = { ...rule, ...result } as ReceiptRule;
      await audit(client, rule.id, rule, after, actor, key, templateVersion);
      return after;
    }
    if (packing && !matches(rule, packing))
      throw new ConflictException(
        'El empaque confirmado cambió. Usa una excepción de blíster para este lote o revisa el catálogo por separado.',
      );
    if (template?.requiresCommercialUnit && !rule.commercial_unit_label)
      throw new BadRequestException(
        'Indica y confirma la unidad comercial de este alimento antes de recibir.',
      );
    return rule;
  }
  const suggested = template ? habitualPacking(template, rule.variety, rule.caliber) : null;
  if (
    templateVersion === 'v4.5' &&
    !packing &&
    suggested?.packingModel === 'blister' &&
    suggested.blistersPerBox === null
  )
    throw new BadRequestException(
      'Confirma el empaque de este calibre excepcional antes de recibir.',
    );
  const selected = packing ?? suggested;
  if (!selected)
    throw new BadRequestException('Confirma la presentación de este producto antes de recibir.');
  const issue = template
    ? habitualPackingIssue(template, rule.variety, rule.caliber, selected)
    : null;
  if (issue) throw new BadRequestException(issue);
  if (
    !packing &&
    rule.blisters_per_box !== null &&
    rule.blisters_per_box !== selected.blistersPerBox
  )
    throw new ConflictException(
      'El borrador tiene un empaque distinto del habitual. Revisa y confirma el empaque.',
    );
  const result = (
    await client.query(
      `update packing_rules set packing_model=$2,half_preparation=$3,
    allowed_presentations=$4,blisters_per_box=$5,box_weight_kg=$6,confirmation_status='confirmed',
    commercial_unit_label=$7,version=version+1,updated_at=now() where id=$1 returning *`,
      [
        rule.id,
        selected.packingModel,
        selected.halfPreparation,
        selected.allowedPresentations,
        selected.blistersPerBox,
        selected.boxWeightKg,
        selected.commercialUnitLabel ?? null,
      ],
    )
  ).rows[0];
  const after = { ...rule, ...result } as ReceiptRule;
  await audit(client, rule.id, rule, after, actor, key, templateVersion);
  return after;
}

/** Caller owns the command/stock/catalog locks and the sole receipt transaction. */
export async function resolveReceiptProduct(
  client: PoolClient,
  product: ReceiptProduct,
  packing: ReceiptPacking | undefined,
  actor: string,
  key: string,
  templateVersion: 'v4.2' | 'v4.5' = 'v4.2',
): Promise<ReceiptRule> {
  if ('configurationId' in product) {
    const rule = (
      await client.query<ReceiptRule>(`${selectRule} where r.id=$1 for update of r`, [
        product.configurationId,
      ])
    ).rows[0];
    if (!rule) throw new BadRequestException('El producto ya no existe. Actualiza el catálogo.');
    if (rule.version !== product.expectedPackingVersion)
      throw new ConflictException('Otra persona cambió el empaque. Revisa la versión actual.');
    return confirmPending(client, rule, packing, actor, key, templateVersion);
  }
  const template = getHabitualTemplate(product.templateId, product.templateVersion);
  if (!template)
    throw new BadRequestException('La plantilla ya no está disponible. Actualiza el catálogo.');
  const varietyName = product.varietyName ?? null,
    caliberLabel = product.caliberLabel ?? null;
  if (!!varietyName !== template.requiresVariety || !!caliberLabel !== template.requiresCaliber)
    throw new BadRequestException(
      'Selecciona la variedad y calibre que corresponden a este producto.',
    );
  let fruit = (
    await client.query('select id from fruits where lower(btrim(name))=lower(btrim($1))', [
      template.fruitName,
    ])
  ).rows[0];
  const existingVariety =
    varietyName && fruit
      ? (
          await client.query(
            'select id,name from varieties where fruit_id=$1 and lower(btrim(name))=lower(btrim($2))',
            [fruit.id, varietyName],
          )
        ).rows[0]
      : null;
  const existingCaliber =
    caliberLabel && fruit
      ? (
          await client.query(
            'select id,label from calibers where fruit_id=$1 and lower(btrim(label))=lower(btrim($2))',
            [fruit.id, caliberLabel],
          )
        ).rows[0]
      : null;
  if (
    varietyName &&
    !existingVariety &&
    !template.varieties.some((v) => catalogNameKey(v) === catalogNameKey(varietyName))
  )
    throw new BadRequestException('Agrega la variedad excepcional al catálogo antes de usarla.');
  if (
    caliberLabel &&
    !existingCaliber &&
    !template.calibers.some((c) => catalogNameKey(c) === catalogNameKey(caliberLabel)) &&
    product.templateVersion !== 'v4.5'
  )
    throw new BadRequestException('Agrega el calibre excepcional al catálogo antes de usarlo.');
  const suggested = habitualPacking(template, varietyName, caliberLabel);
  if (
    product.templateVersion === 'v4.5' &&
    !packing &&
    suggested?.packingModel === 'blister' &&
    suggested.blistersPerBox === null
  )
    throw new BadRequestException(
      'Confirma el empaque de este calibre excepcional antes de recibir.',
    );
  const selected = packing ?? suggested;
  if (!selected)
    throw new BadRequestException('Confirma la presentación de este producto antes de recibir.');
  const issue = habitualPackingIssue(template, varietyName, caliberLabel, selected);
  if (issue) throw new BadRequestException(issue);
  if (!fruit) {
    await client.query('insert into fruits(name) values($1) on conflict do nothing', [
      template.fruitName,
    ]);
    fruit = (
      await client.query('select id from fruits where lower(btrim(name))=lower(btrim($1))', [
        template.fruitName,
      ])
    ).rows[0];
  }
  let varietyId = existingVariety?.id ?? null,
    caliberId = existingCaliber?.id ?? null;
  if (varietyName && !varietyId) {
    const canonical = template.varieties.find(
      (v) => catalogNameKey(v) === catalogNameKey(varietyName),
    )!;
    await client.query(
      'insert into varieties(fruit_id,name) values($1,$2) on conflict do nothing',
      [fruit.id, canonical],
    );
    varietyId = (
      await client.query(
        'select id from varieties where fruit_id=$1 and lower(btrim(name))=lower(btrim($2))',
        [fruit.id, canonical],
      )
    ).rows[0].id;
  }
  if (caliberLabel && !caliberId) {
    await client.query(
      'insert into calibers(fruit_id,label) values($1,$2) on conflict do nothing',
      [fruit.id, caliberLabel],
    );
    caliberId = (
      await client.query(
        'select id from calibers where fruit_id=$1 and lower(btrim(label))=lower(btrim($2))',
        [fruit.id, caliberLabel],
      )
    ).rows[0].id;
  }
  const identity = [fruit.id, varietyId, caliberId, template.commercialLine || 'Estándar'];
  await client.query(
    'insert into product_variants(fruit_id,variety_id,caliber_id,commercial_line) values($1,$2,$3,$4) on conflict do nothing',
    identity,
  );
  const variant = (
    await client.query(
      `select id from product_variants where fruit_id=$1 and variety_id is not distinct from $2::uuid
    and caliber_id is not distinct from $3::uuid and commercial_line=$4`,
      identity,
    )
  ).rows[0];
  const inserted = (
    await client.query(
      `insert into packing_rules(variant_id,packing_model,half_preparation,allowed_presentations,
    blisters_per_box,box_weight_kg,confirmation_status,notes,commercial_unit_label) values($1,$2,$3,$4,$5,$6,'confirmed',$7,$8)
    on conflict do nothing returning id`,
      [
        variant.id,
        selected.packingModel,
        selected.halfPreparation,
        selected.allowedPresentations,
        selected.blistersPerBox,
        selected.boxWeightKg,
        `Configuración habitual revisada al guardar la recepción ${product.templateVersion}.`,
        selected.commercialUnitLabel ?? null,
      ],
    )
  ).rows[0];
  const rule = (
    await client.query<ReceiptRule>(`${selectRule} where r.variant_id=$1 for update of r`, [
      variant.id,
    ])
  ).rows[0]!;
  if (!inserted) {
    // A product materialized by another command is reused only if its packing is the reviewed one.
    return confirmPending(client, rule, selected, actor, key, product.templateVersion);
  }
  await audit(client, rule.id, null, rule, actor, key, product.templateVersion);
  return rule;
}
