// Datos ficticios para la demo (docs/migracion.md, «Datos de demostración»). No son clientes
// de la agencia: los nombres llevan el apellido «Demo», los DNI son de la serie 991000xx y cada
// póliza dice en sus observaciones que es un dato ficticio. Las fechas se arman desde el día de
// la carga, para que siempre haya cuotas vencidas y por vencer. Lo usa cargar-demo.ts.
import { addMonths, installmentPlan, monthlyDueDates, overdueInstallments, type PlannedInstallment } from '../src/domain/installments.js'

export const demoObservation = 'Dato ficticio de demostración'

// Números que no corresponden a ningún WhatsApp, para cuando no se pasan los de la demo.
export const fallbackPhones = { customer: '5490000000001', shared: '5490000000002' } as const

export interface DemoPhones {
  // Vinculado solo a Lucía Demo: la identifica sin pedir el DNI.
  customer: string
  // Compartido por Martín Demo y Sofía Demo: pide el DNI.
  shared: string
}

export interface DemoPolicy {
  number: string
  ramo: 'auto' | 'moto' | 'hogar' | 'vida'
  status: 'activa' | 'suspendida por mora'
  currency: 'ARS' | 'USD'
  startDate: string
  endDate: string
  premiumCents: number | null
  insuredItem: { description: string; plate: string | null; address: string | null } | null
  installments: PlannedInstallment[]
}

export interface DemoCustomer {
  dni: string
  firstName: string
  lastName: string
  active: boolean
  phones: string[]
  policies: DemoPolicy[]
  // El caso límite que prueba, para el informe de la carga y la documentación.
  edgeCase: string
}

// Solo dígitos y hasta 15, como telefono.numero. El error no muestra el número completo.
export function validateDemoPhones(phones: DemoPhones): void {
  for (const [name, value] of [['DEMO_TELEFONO_CLIENTE', phones.customer], ['DEMO_TELEFONO_COMPARTIDO', phones.shared]] as const) {
    if (!/^\d{1,15}$/.test(value)) {
      throw new Error(`${name} (terminado en ${maskPhone(value)}) tiene que tener solo dígitos y hasta 15.`)
    }
  }
  if (phones.customer === phones.shared) {
    throw new Error('DEMO_TELEFONO_CLIENTE y DEMO_TELEFONO_COMPARTIDO tienen que ser números distintos.')
  }
}

export function maskPhone(phone: string): string {
  return `…${phone.slice(-3)}`
}

export function demoCustomers(today: string, phones: DemoPhones): DemoCustomer[] {
  validateDemoPhones(phones)
  return [
    {
      dni: '99100001',
      firstName: 'Lucía',
      lastName: 'Demo',
      active: true,
      phones: [phones.customer],
      edgeCase: 'número vinculado a un solo cliente: varias pólizas y monedas, cuotas vencidas, al día y póliza vencida',
      policies: [
        // 4 cuotas vencidas, 2 pagas: quedan 2 vencidas sin pagar y el resto por vencer.
        policy('POL-00001', 'auto', 'activa', 'ARS', today, -4, 8, 45_000_00, { paid: 2, plate: 'DEMO001' }),
        // Todas las vencidas pagas: solo cuotas por vencer.
        policy('POL-00002', 'hogar', 'activa', 'USD', today, -3, 9, 20_00, { paid: 'overdue', address: 'Calle Ficticia 100' }),
        // Vencida por fecha y con todo pago.
        policy('POL-00003', 'moto', 'activa', 'ARS', today, -14, -2, 12_000_00, { paid: 'overdue', plate: 'DEMO003' }),
      ],
    },
    {
      dni: '99100002',
      firstName: 'Martín',
      lastName: 'Demo',
      active: true,
      phones: [phones.shared],
      edgeCase: 'número compartido (pide el DNI): suspendida por mora y cuotas solo por vencer',
      policies: [
        policy('POL-00004', 'auto', 'activa', 'ARS', today, 0, 12, 38_000_00, { paid: 0, plate: 'DEMO004' }),
        // 5 cuotas vencidas, 2 pagas: quedan 3 vencidas sin pagar.
        policy('POL-00006', 'moto', 'suspendida por mora', 'ARS', today, -5, 7, 15_000_00, { paid: 2, plate: 'DEMO006' }),
      ],
    },
    {
      dni: '99100003',
      firstName: 'Sofía',
      lastName: 'Demo',
      active: true,
      phones: [phones.shared],
      edgeCase: 'número compartido: póliza sin prima ni cuotas, el saldo se deriva',
      policies: [policy('POL-00005', 'vida', 'activa', 'ARS', today, -2, 10, null, { paid: 0 })],
    },
    {
      dni: '99100004',
      firstName: 'Carlos',
      lastName: 'Demo',
      active: true,
      phones: [],
      edgeCase: 'sin teléfono ni pólizas: cambio de teléfono desde un número no vinculado',
      policies: [],
    },
    {
      dni: '99100005',
      firstName: 'Elena',
      lastName: 'Demo',
      active: false,
      phones: [],
      edgeCase: 'cliente dada de baja',
      policies: [],
    },
  ]
}

function policy(
  number: string,
  ramo: DemoPolicy['ramo'],
  status: DemoPolicy['status'],
  currency: DemoPolicy['currency'],
  today: string,
  startMonths: number,
  endMonths: number,
  premiumCents: number | null,
  options: { paid: number | 'overdue'; plate?: string; address?: string },
): DemoPolicy {
  const startDate = addMonths(today, startMonths)
  const endDate = addMonths(today, endMonths)
  const paid = options.paid === 'overdue'
    ? overdueInstallments(monthlyDueDates(startDate, endDate), today)
    : options.paid
  const insuredItem = ramo === 'vida'
    ? null
    : {
        description: `Bien ficticio de demostración (${ramo})`,
        plate: options.plate ?? null,
        address: options.address === undefined ? null : `${options.address} (dato de demostración)`,
      }
  return {
    number,
    ramo,
    status,
    currency,
    startDate,
    endDate,
    premiumCents,
    insuredItem,
    installments: premiumCents === null ? [] : installmentPlan({ startDate, endDate, premiumCents }, paid),
  }
}
