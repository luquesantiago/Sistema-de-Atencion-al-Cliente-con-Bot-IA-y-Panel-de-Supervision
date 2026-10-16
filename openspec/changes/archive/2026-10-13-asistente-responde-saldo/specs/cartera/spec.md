# Spec Delta

## ADDED Requirements

### Requirement: Cuotas de ejemplo para mostrar el saldo

El sistema SHALL ofrecer una carga opcional y aparte de la migración de la planilla que, sobre una base con la planilla ya migrada y sin ninguna cuota, registre cuotas de ejemplo para todas las pólizas activas de dos clientes migrados con número vinculado: el titular de POL-00123, con las dos últimas cuotas de cada póliza sin pagar, y la titular de POL-00124, con todas sus cuotas pagas; cada cuota es mensual, desde el inicio de la vigencia hasta su vencimiento, con la prima mensual de la póliza como importe; los demás clientes quedan sin cuotas; y las cuotas de ejemplo SHALL quedar documentadas como datos ficticios, porque la planilla no registra cuotas ni pagos (RF-CAR-02).

#### Scenario: Carga sobre la planilla migrada
- **WHEN** se corre la carga de cuotas de ejemplo sobre una base con la planilla migrada y la tabla `cuota` vacía
- **THEN** cada póliza activa del titular de POL-00123 y de la titular de POL-00124 tiene una cuota por mes de su vigencia, numeradas desde 1, con la prima mensual como importe; las dos últimas de cada póliza del titular de POL-00123 quedan sin fecha de pago y las demás quedan pagas en su fecha de vencimiento
- **AND** ninguna póliza de otro cliente tiene cuotas
- **AND** la carga informa cuántas cuotas registró por número de póliza, sin mostrar DNI ni teléfonos

#### Scenario: Ya hay cuotas en la base
- **WHEN** se corre la carga y la tabla `cuota` ya tiene alguna fila
- **THEN** la carga no escribe nada e informa que la tabla no está vacía

#### Scenario: Falta un dato para armar las cuotas
- **WHEN** se corre la carga y no está POL-00123 o POL-00124, o una de las pólizas que tiene que recibir cuotas no tiene prima mensual
- **THEN** la carga no escribe nada e informa qué póliza falta o no tiene prima

#### Scenario: Una falla a mitad de la carga
- **WHEN** la carga falla después de empezar a escribir
- **THEN** la base queda sin ninguna de las cuotas de esa carga

#### Scenario: Los datos ficticios quedan documentados
- **WHEN** se consulta la documentación de la migración
- **THEN** dice que las cuotas de la base son de ejemplo mientras la agencia no informe las reales, cómo se cargan y cómo se quitan
