# Spec Delta

## Purpose

Módulo «Atención automatizada» de `docs/requisitos.md`: la recepción de consultas por WhatsApp, la respuesta automática de las consultas sin riesgo con datos de la cartera, el pedido de DNI y la toma de prospectos (RF-ATE-01 a RF-ATE-05).

## ADDED Requirements

### Requirement: El asistente recibe y responde por WhatsApp

El sistema SHALL recibir por WhatsApp cada mensaje de texto que un cliente le escribe al número de la agencia, entregárselo al asistente y, cuando el asistente genera una respuesta, enviársela al mismo número desde el que escribió el cliente (RF-ATE-01).

#### Scenario: Respuesta enviada al mismo número
- **WHEN** un cliente escribe un mensaje de texto al número de la agencia y el asistente genera una respuesta
- **THEN** la respuesta le llega al cliente por WhatsApp, en el mismo número desde el que escribió

#### Scenario: Remitente identificado con un id oculto
- **WHEN** WhatsApp entrega el mensaje con un identificador que oculta el número del remitente (`@lid`) y el canal puede obtener ese número
- **THEN** el asistente procesa el mensaje con el número del remitente y, si genera una respuesta, se la envía a ese número

#### Scenario: Número del remitente desconocido
- **WHEN** el canal no puede obtener un número de teléfono válido del remitente
- **THEN** el mensaje no se procesa, no se le responde y el aviso queda registrado en el log del backend sin el texto del mensaje

#### Scenario: Mensaje repetido
- **WHEN** el canal entrega de nuevo un mensaje que ya se procesó con éxito, sin que el backend se haya reiniciado entre medio
- **THEN** el mensaje no se procesa otra vez y el cliente no recibe otra respuesta

#### Scenario: Mensajes seguidos del mismo número
- **WHEN** un cliente manda dos mensajes seguidos y ninguno falla al procesarse
- **THEN** el asistente procesa el segundo después de terminar el primero, en el orden en que llegaron al backend

#### Scenario: Falla al procesar
- **WHEN** el proceso de un mensaje falla
- **THEN** el backend responde con error, el mensaje no queda marcado como procesado y, cuando el canal lo vuelve a entregar, se procesa desde el mismo estado que tenía la conversación antes de la falla

#### Scenario: Mensaje sin texto
- **WHEN** el cliente manda un audio, una foto u otro archivo sin texto
- **THEN** el mensaje no se procesa, no se le responde y el aviso queda registrado en el log del backend

### Requirement: El canal solo acepta avisos autenticados

El sistema MUST rechazar todo aviso de mensaje entrante que no traiga el secreto compartido con el servicio de WhatsApp, sin leer su contenido ni procesarlo, para que nadie pueda hacerse pasar por un cliente escribiéndole directo al backend (RF-ATE-01).

#### Scenario: Secreto incorrecto o ausente
- **WHEN** llega un aviso al webhook sin el secreto o con uno que no coincide
- **THEN** el backend responde 401 sin cuerpo y el asistente no procesa nada

#### Scenario: Secreto correcto
- **WHEN** llega un aviso al webhook con el secreto correcto
- **THEN** el backend lo procesa y responde 2xx recién después de procesarlo
