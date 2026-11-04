## MODIFIED Requirements

### Requirement: Tomar un caso desde la bandeja

El sistema SHALL permitir que un empleado tome desde la Bandeja de Atención un caso que esté en la bandeja y no tenga responsable, y que desde ese momento quede como responsable del caso con la fecha y hora de la toma; un caso que tiene otro responsable no se puede tomar hasta que su responsable lo libere, y tomar un caso propio no lo cambia; tomar un caso no le envía nada al cliente ni cambia el silencio de la conversación; el empleado que actúa es el usuario con la sesión iniciada en el panel, nunca uno que mande el navegador (RF-DER-02, RF-SUP-07).

#### Scenario: Caso sin tomar
- **WHEN** un empleado toma un caso derivado que no tiene responsable
- **THEN** el caso queda con ese empleado como responsable y con la fecha y hora de la toma, y la bandeja deja de mostrarlo «Sin tomar»

#### Scenario: Caso de otro responsable
- **WHEN** un empleado intenta tomar un caso migrado de la planilla que tiene como responsable a Graciela
- **THEN** el sistema rechaza la toma y avisa que el caso lo tiene otra persona y que tiene que liberarlo antes, y el caso no cambia

#### Scenario: Caso propio
- **WHEN** el responsable de un caso lo vuelve a tomar
- **THEN** el caso no cambia

#### Scenario: Tomar no cambia la conversación
- **WHEN** un empleado toma un caso derivado y después el cliente escribe
- **THEN** el cliente no recibió ningún mensaje por la toma, el asistente no le contesta y el mensaje queda guardado en el caso

#### Scenario: Caso que ya no está en la bandeja
- **WHEN** un empleado intenta tomar un caso cerrado, o uno abierto sin derivar y sin nada pendiente
- **THEN** el sistema responde que el caso no está en la bandeja y el caso no cambia

#### Scenario: Toma simultánea
- **WHEN** dos empleados toman el mismo caso al mismo tiempo
- **THEN** el caso queda con uno solo de ellos como responsable y al otro el sistema le avisa que el caso cambió mientras lo tomaba
