import type { AgencyInfo, AgencyInfoSource } from '../domain/agency-info.js'

// Doble de prueba de la información de la agencia: devuelve la que define cada prueba.
export class InMemoryAgencyInfoSource implements AgencyInfoSource {
  public constructor(public info: AgencyInfo) {}

  public async read(): Promise<AgencyInfo> {
    return structuredClone(this.info)
  }
}
