-- =====================================================================
-- Caso 8 - Sistema de Atención al Cliente con Bot IA y Panel de Supervisión
-- Seguros Castaño - PPP 1, UNLa, Grupo 11
--
-- Esquema de base de datos. Motor: MySQL 8.4 LTS.
-- Corresponde uno a uno con el DER (caso8_der.puml).
-- Convenciones: nombres en español, ids autoincrementales, bajas lógicas
-- mediante el campo `activo` en las entidades maestras. Toda referencia
-- entre tablas se hace por id, y los estados y tipos van en tablas
-- catálogo. Lo que se deduce de otros datos (el estado del caso, si una
-- póliza está vencida) no se guarda: se calcula.
-- Fechas y horas en UTC: el servidor MySQL tiene que correr en UTC para
-- que CURRENT_TIMESTAMP y NOW() coincidan con lo que escribe Prisma, que
-- siempre escribe en UTC. La hora argentina se usa solo para mostrar y
-- para comparar con `horario_atencion`.
-- Última revisión: 21/09/2026, noche (tipo de consulta, fechas en UTC,
-- sesión con caso derivado y baja de póliza).
-- =====================================================================

-- El script declara su codificación. Sin esta línea, el cliente mysql del
-- contenedor (locale POSIX) lo lee como latin1 y los textos con tilde se
-- guardan mal: 'cotización' queda como 'cotizaciÃ³n' (probado el
-- 21/09/2026 con docker exec y con docker-entrypoint-initdb.d).
SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS seguros_castano
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE seguros_castano;

-- =====================================================================
-- SEGURIDAD Y CONFIGURACIÓN
-- =====================================================================

CREATE TABLE rol (
  id_rol      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre      VARCHAR(50)  NOT NULL,
  PRIMARY KEY (id_rol),
  UNIQUE KEY uk_rol_nombre (nombre)
) ENGINE = InnoDB;

CREATE TABLE usuario (
  id_usuario      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_rol          INT UNSIGNED NOT NULL,
  nombre_usuario  VARCHAR(50)  NOT NULL,
  contrasena_hash VARCHAR(255) NOT NULL,
  nombre          VARCHAR(100) NOT NULL,
  apellido        VARCHAR(100) NOT NULL,
  fecha_alta      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  activo          BOOLEAN      NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id_usuario),
  UNIQUE KEY uk_usuario_nombre_usuario (nombre_usuario),
  CONSTRAINT fk_usuario_rol FOREIGN KEY (id_rol) REFERENCES rol (id_rol)
) ENGINE = InnoDB;

-- Parámetros operativos editables por el administrador: tope de reintentos
-- de DNI, minutos máximos de un caso derivado sin tomar y minutos de
-- inactividad que cierran una conversación (si no tiene un caso derivado
-- sin cerrar). Los valores se guardan como texto: el backend valida que
-- cada uno tenga el tipo correcto.
CREATE TABLE parametro_configuracion (
  id_parametro INT UNSIGNED NOT NULL AUTO_INCREMENT,
  clave        VARCHAR(100) NOT NULL,
  valor        VARCHAR(255) NOT NULL,
  descripcion  VARCHAR(255) NULL,
  PRIMARY KEY (id_parametro),
  UNIQUE KEY uk_parametro_clave (clave)
) ENGINE = InnoDB;

-- Horario de atención humana, editable por el administrador. Una fila por
-- día con atención: un día sin fila no tiene atención humana.
-- `dia_semana`: 1 = lunes ... 7 = domingo (numeración ISO 8601).
-- Excepción a la regla de UTC: estas horas son de Argentina. El backend
-- compara la hora actual de Argentina con este rango.
CREATE TABLE horario_atencion (
  id_horario    INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  dia_semana    TINYINT UNSIGNED NOT NULL,
  hora_apertura TIME             NOT NULL,
  hora_cierre   TIME             NOT NULL,
  PRIMARY KEY (id_horario),
  UNIQUE KEY uk_horario_dia (dia_semana),
  CONSTRAINT ck_horario_dia   CHECK (dia_semana BETWEEN 1 AND 7),
  CONSTRAINT ck_horario_rango CHECK (hora_cierre > hora_apertura)
) ENGINE = InnoDB;

-- =====================================================================
-- CARTERA
-- =====================================================================

CREATE TABLE ramo (
  id_ramo INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre  VARCHAR(50)  NOT NULL,
  activo  BOOLEAN      NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id_ramo),
  UNIQUE KEY uk_ramo_nombre (nombre)
) ENGINE = InnoDB;

-- Los planes son transversales a los ramos y se dan de alta desde el panel.
CREATE TABLE plan (
  id_plan     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre      VARCHAR(100) NOT NULL,
  descripcion VARCHAR(255) NULL,
  activo      BOOLEAN      NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id_plan),
  UNIQUE KEY uk_plan_nombre (nombre)
) ENGINE = InnoDB;

-- Por ahora el equipo asume que Seguros Castaño es la aseguradora de todas
-- sus pólizas (supuesto a confirmar con la agencia). La tabla se mantiene
-- para registrar otras compañías si la agencia opera con ellas.
CREATE TABLE compania_aseguradora (
  id_compania INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre      VARCHAR(150) NOT NULL,
  activo      BOOLEAN      NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id_compania),
  UNIQUE KEY uk_compania_nombre (nombre)
) ENGINE = InnoDB;

-- Monedas con su código ISO 4217. La agencia trabaja con pesos y dólares.
CREATE TABLE moneda (
  id_moneda INT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo    CHAR(3)      NOT NULL,
  nombre    VARCHAR(50)  NOT NULL,
  PRIMARY KEY (id_moneda),
  UNIQUE KEY uk_moneda_codigo (codigo),
  UNIQUE KEY uk_moneda_nombre (nombre),
  CONSTRAINT ck_moneda_codigo CHECK (REGEXP_LIKE(codigo, '^[A-Z]{3}$', 'c'))
) ENGINE = InnoDB;

-- Solo los estados que decide una persona. "Vencida" no es un estado: una
-- póliza está vencida cuando su fecha_vencimiento ya pasó. "Dada de baja"
-- es el estado que deja una baja aprobada (no es lo mismo que `activo`).
CREATE TABLE estado_poliza (
  id_estado_poliza INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre           VARCHAR(50)  NOT NULL,
  PRIMARY KEY (id_estado_poliza),
  UNIQUE KEY uk_estado_poliza_nombre (nombre)
) ENGINE = InnoDB;

CREATE TABLE estado_siniestro (
  id_estado_siniestro INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre              VARCHAR(50)  NOT NULL,
  PRIMARY KEY (id_estado_siniestro),
  UNIQUE KEY uk_estado_siniestro_nombre (nombre)
) ENGINE = InnoDB;

-- Un cliente es una persona (DNI, apellido y nombre) o una empresa (CUIT y
-- razón social): ck_cliente_tipo exige un grupo completo y el otro vacío.
-- DNI y CUIT se guardan normalizados, solo dígitos, y son únicos: así se
-- evitan los duplicados de la planilla (28.111.222 y 28111222).
CREATE TABLE cliente (
  id_cliente   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  dni          VARCHAR(8)   NULL,
  apellido     VARCHAR(100) NULL,
  nombre       VARCHAR(100) NULL,
  cuit         CHAR(11)     NULL,
  razon_social VARCHAR(200) NULL,
  fecha_alta   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  activo       BOOLEAN      NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id_cliente),
  UNIQUE KEY uk_cliente_dni (dni),
  UNIQUE KEY uk_cliente_cuit (cuit),
  CONSTRAINT ck_cliente_dni  CHECK (dni IS NULL OR REGEXP_LIKE(dni, '^[0-9]{7,8}$')),
  CONSTRAINT ck_cliente_cuit CHECK (cuit IS NULL OR REGEXP_LIKE(cuit, '^[0-9]{11}$')),
  CONSTRAINT ck_cliente_tipo CHECK (
    (dni IS NOT NULL AND apellido IS NOT NULL AND nombre IS NOT NULL
      AND cuit IS NULL AND razon_social IS NULL)
    OR
    (cuit IS NOT NULL AND razon_social IS NOT NULL
      AND dni IS NULL AND apellido IS NULL AND nombre IS NULL))
) ENGINE = InnoDB;

-- Número normalizado: solo dígitos, con código de país (formato E.164 sin
-- el "+"), por ejemplo 5491155551001. La base solo controla que sean de 10
-- a 15 dígitos: no exige el código de país ni el 9 de los celulares. La
-- normalización la hace el backend (la regla del 9 está pendiente de
-- confirmar). También guarda los números de WhatsApp que todavía no están
-- vinculados a ningún cliente.
CREATE TABLE telefono (
  id_telefono INT UNSIGNED NOT NULL AUTO_INCREMENT,
  numero      VARCHAR(15)  NOT NULL,
  activo      BOOLEAN      NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id_telefono),
  UNIQUE KEY uk_telefono_numero (numero),
  CONSTRAINT ck_telefono_numero CHECK (REGEXP_LIKE(numero, '^[0-9]{10,15}$'))
) ENGINE = InnoDB;

-- N:M: un cliente puede tener varios teléfonos y un teléfono puede
-- pertenecer a varios clientes (definición de la entrevista del 16/09/2026).
CREATE TABLE cliente_telefono (
  id_cliente  INT UNSIGNED NOT NULL,
  id_telefono INT UNSIGNED NOT NULL,
  fecha_alta  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_cliente, id_telefono),
  KEY ix_cliente_telefono_telefono (id_telefono),
  CONSTRAINT fk_cliente_telefono_cliente
    FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente),
  CONSTRAINT fk_cliente_telefono_telefono
    FOREIGN KEY (id_telefono) REFERENCES telefono (id_telefono)
) ENGINE = InnoDB;

-- Una sola tabla para todos los ramos; el ramo lo define la póliza.
-- `patente_matricula` (patente de autos y motos, matrícula de
-- embarcaciones) es única y se guarda en mayúsculas, sin espacios ni
-- guiones. `direccion` es para inmuebles y comercios.
CREATE TABLE bien_asegurado (
  id_bien           INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  descripcion       VARCHAR(255)      NOT NULL,
  patente_matricula VARCHAR(20)       NULL,
  direccion         VARCHAR(255)      NULL,
  marca             VARCHAR(100)      NULL,
  modelo            VARCHAR(100)      NULL,
  anio              SMALLINT UNSIGNED NULL,
  activo            BOOLEAN           NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id_bien),
  UNIQUE KEY uk_bien_patente_matricula (patente_matricula),
  CONSTRAINT ck_bien_patente_matricula
    CHECK (patente_matricula IS NULL OR REGEXP_LIKE(patente_matricula, '^[A-Z0-9]+$', 'c')),
  CONSTRAINT ck_bien_anio CHECK (anio IS NULL OR anio BETWEEN 1900 AND 2100)
) ENGINE = InnoDB;

-- `id_bien` es NULL en los ramos que no aseguran un bien (vida).
-- `numero_poliza` es único dentro de cada compañía; las relaciones usan
-- siempre `id_poliza`. Una póliza está vencida cuando fecha_vencimiento ya
-- pasó: se calcula, no es un estado. "Hoy" es la fecha de Argentina, no
-- CURDATE() del servidor: en UTC, de 21 a 24 h ya es el día siguiente.
-- Una baja aprobada pasa la póliza al estado "dada de baja" y la póliza
-- sigue visible; `activo = FALSE` es solo para un registro cargado por
-- error. Cartera activa: estado "activa", no vencida y `activo = TRUE`.
CREATE TABLE poliza (
  id_poliza         INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  numero_poliza     VARCHAR(50)   NOT NULL,
  id_cliente        INT UNSIGNED  NOT NULL,
  id_compania       INT UNSIGNED  NOT NULL,
  id_ramo           INT UNSIGNED  NOT NULL,
  id_bien           INT UNSIGNED  NULL,
  id_estado_poliza  INT UNSIGNED  NOT NULL,
  id_moneda         INT UNSIGNED  NOT NULL,
  fecha_inicio      DATE          NOT NULL,
  fecha_vencimiento DATE          NOT NULL,
  prima_mensual     DECIMAL(12,2) NULL,
  observaciones     TEXT          NULL,
  fecha_alta        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  activo            BOOLEAN       NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id_poliza),
  UNIQUE KEY uk_poliza_compania_numero (id_compania, numero_poliza),
  KEY ix_poliza_cliente (id_cliente),
  KEY ix_poliza_vencimiento (fecha_vencimiento),
  CONSTRAINT fk_poliza_cliente  FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente),
  CONSTRAINT fk_poliza_compania FOREIGN KEY (id_compania) REFERENCES compania_aseguradora (id_compania),
  CONSTRAINT fk_poliza_ramo     FOREIGN KEY (id_ramo) REFERENCES ramo (id_ramo),
  CONSTRAINT fk_poliza_bien     FOREIGN KEY (id_bien) REFERENCES bien_asegurado (id_bien),
  CONSTRAINT fk_poliza_estado   FOREIGN KEY (id_estado_poliza) REFERENCES estado_poliza (id_estado_poliza),
  CONSTRAINT fk_poliza_moneda   FOREIGN KEY (id_moneda) REFERENCES moneda (id_moneda),
  CONSTRAINT ck_poliza_vigencia CHECK (fecha_vencimiento >= fecha_inicio),
  CONSTRAINT ck_poliza_prima    CHECK (prima_mensual IS NULL OR prima_mensual >= 0)
) ENGINE = InnoDB;

-- Estructura póliza -> cobertura -> plan.
CREATE TABLE cobertura (
  id_cobertura   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_poliza      INT UNSIGNED NOT NULL,
  id_plan        INT UNSIGNED NOT NULL,
  descripcion    VARCHAR(255) NULL,
  suma_asegurada DECIMAL(14,2) NULL,
  activo         BOOLEAN      NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id_cobertura),
  KEY ix_cobertura_poliza (id_poliza),
  CONSTRAINT fk_cobertura_poliza FOREIGN KEY (id_poliza) REFERENCES poliza (id_poliza),
  CONSTRAINT fk_cobertura_plan   FOREIGN KEY (id_plan) REFERENCES plan (id_plan),
  CONSTRAINT ck_cobertura_suma   CHECK (suma_asegurada IS NULL OR suma_asegurada >= 0)
) ENGINE = InnoDB;

-- Reemplaza los beneficiarios escritos en la columna de observaciones.
CREATE TABLE beneficiario (
  id_beneficiario INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_poliza       INT UNSIGNED NOT NULL,
  nombre_completo VARCHAR(200) NOT NULL,
  vinculo         VARCHAR(100) NULL,
  porcentaje      DECIMAL(5,2) NULL,
  activo          BOOLEAN      NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id_beneficiario),
  KEY ix_beneficiario_poliza (id_poliza),
  CONSTRAINT fk_beneficiario_poliza FOREIGN KEY (id_poliza) REFERENCES poliza (id_poliza),
  CONSTRAINT ck_beneficiario_porcentaje
    CHECK (porcentaje IS NULL OR (porcentaje > 0 AND porcentaje <= 100))
) ENGINE = InnoDB;

-- El sistema registra la situación de pago para poder informarla;
-- no gestiona cobros (pagos fuera de alcance).
CREATE TABLE cuota (
  id_cuota          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_poliza         INT UNSIGNED NOT NULL,
  numero_cuota      SMALLINT UNSIGNED NOT NULL,
  fecha_vencimiento DATE         NOT NULL,
  importe           DECIMAL(12,2) NOT NULL,
  fecha_pago        DATE         NULL,
  PRIMARY KEY (id_cuota),
  UNIQUE KEY uk_cuota_poliza_numero (id_poliza, numero_cuota),
  CONSTRAINT fk_cuota_poliza FOREIGN KEY (id_poliza) REFERENCES poliza (id_poliza),
  CONSTRAINT ck_cuota_importe CHECK (importe >= 0)
) ENGINE = InnoDB;

CREATE TABLE siniestro (
  id_siniestro        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  numero_siniestro    VARCHAR(50)  NOT NULL,
  id_poliza           INT UNSIGNED NOT NULL,
  id_estado_siniestro INT UNSIGNED NOT NULL,
  fecha_ocurrencia    DATE         NOT NULL,
  fecha_registro      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  descripcion         TEXT         NULL,
  activo              BOOLEAN      NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id_siniestro),
  UNIQUE KEY uk_siniestro_numero (numero_siniestro),
  KEY ix_siniestro_poliza (id_poliza),
  CONSTRAINT fk_siniestro_poliza FOREIGN KEY (id_poliza) REFERENCES poliza (id_poliza),
  CONSTRAINT fk_siniestro_estado FOREIGN KEY (id_estado_siniestro) REFERENCES estado_siniestro (id_estado_siniestro),
  CONSTRAINT ck_siniestro_fechas CHECK (fecha_ocurrencia <= fecha_registro)
) ENGINE = InnoDB;

-- Conductores agregados a una póliza (por ejemplo, el hijo del titular de
-- CASO-012). Una persona puede manejar en varias pólizas: la relación es
-- N:M. El vínculo se crea al aplicar una solicitud "alta de conductor"
-- aprobada.
CREATE TABLE conductor (
  id_conductor INT UNSIGNED NOT NULL AUTO_INCREMENT,
  dni          VARCHAR(8)   NOT NULL,
  apellido     VARCHAR(100) NOT NULL,
  nombre       VARCHAR(100) NOT NULL,
  activo       BOOLEAN      NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id_conductor),
  UNIQUE KEY uk_conductor_dni (dni),
  CONSTRAINT ck_conductor_dni CHECK (REGEXP_LIKE(dni, '^[0-9]{7,8}$'))
) ENGINE = InnoDB;

CREATE TABLE poliza_conductor (
  id_poliza    INT UNSIGNED NOT NULL,
  id_conductor INT UNSIGNED NOT NULL,
  fecha_alta   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_poliza, id_conductor),
  KEY ix_poliza_conductor_conductor (id_conductor),
  CONSTRAINT fk_poliza_conductor_poliza
    FOREIGN KEY (id_poliza) REFERENCES poliza (id_poliza),
  CONSTRAINT fk_poliza_conductor_conductor
    FOREIGN KEY (id_conductor) REFERENCES conductor (id_conductor)
) ENGINE = InnoDB;

-- =====================================================================
-- CATÁLOGOS DE ATENCIÓN, VERIFICACIÓN Y ACCIONES
-- =====================================================================

-- `orden` = 1 es lo más grave: es lo que prioriza la bandeja de revisión.
CREATE TABLE nivel_riesgo (
  id_nivel_riesgo INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre          VARCHAR(50)  NOT NULL,
  orden           TINYINT UNSIGNED NOT NULL,
  PRIMARY KEY (id_nivel_riesgo),
  UNIQUE KEY uk_nivel_riesgo_nombre (nombre),
  UNIQUE KEY uk_nivel_riesgo_orden (orden)
) ENGINE = InnoDB;

CREATE TABLE origen_mensaje (
  id_origen_mensaje INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre            VARCHAR(50)  NOT NULL,
  PRIMARY KEY (id_origen_mensaje),
  UNIQUE KEY uk_origen_mensaje_nombre (nombre)
) ENGINE = InnoDB;

-- Tipo de consulta que detecta el asistente (flujo F12 del diagrama de
-- contexto). Normaliza la columna tipo_consulta_detectado de la planilla.
CREATE TABLE tipo_consulta (
  id_tipo_consulta INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre           VARCHAR(50)  NOT NULL,
  PRIMARY KEY (id_tipo_consulta),
  UNIQUE KEY uk_tipo_consulta_nombre (nombre)
) ENGINE = InnoDB;

CREATE TABLE estado_prospecto (
  id_estado_prospecto INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre              VARCHAR(50)  NOT NULL,
  PRIMARY KEY (id_estado_prospecto),
  UNIQUE KEY uk_estado_prospecto_nombre (nombre)
) ENGINE = InnoDB;

CREATE TABLE resultado_verificacion (
  id_resultado_verificacion INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre                    VARCHAR(50)  NOT NULL,
  PRIMARY KEY (id_resultado_verificacion),
  UNIQUE KEY uk_resultado_verificacion_nombre (nombre)
) ENGINE = InnoDB;

CREATE TABLE tipo_alerta (
  id_tipo_alerta          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre                  VARCHAR(100) NOT NULL,
  id_nivel_riesgo_default INT UNSIGNED NOT NULL,
  PRIMARY KEY (id_tipo_alerta),
  UNIQUE KEY uk_tipo_alerta_nombre (nombre),
  CONSTRAINT fk_tipo_alerta_nivel
    FOREIGN KEY (id_nivel_riesgo_default) REFERENCES nivel_riesgo (id_nivel_riesgo)
) ENGINE = InnoDB;

CREATE TABLE tipo_accion (
  id_tipo_accion INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre         VARCHAR(100) NOT NULL,
  PRIMARY KEY (id_tipo_accion),
  UNIQUE KEY uk_tipo_accion_nombre (nombre)
) ENGINE = InnoDB;

CREATE TABLE estado_solicitud (
  id_estado_solicitud INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre              VARCHAR(50)  NOT NULL,
  PRIMARY KEY (id_estado_solicitud),
  UNIQUE KEY uk_estado_solicitud_nombre (nombre)
) ENGINE = InnoDB;

-- =====================================================================
-- ATENCIÓN
-- =====================================================================

-- Sesión de WhatsApp con un número. Empieza con el primer mensaje y termina
-- (`fecha_fin`) cuando pasa el tiempo de inactividad configurado: el
-- próximo mensaje de ese número abre una conversación nueva y el asistente
-- vuelve a pedir el DNI. Excepción: si la conversación tiene un caso
-- derivado sin cerrar, la inactividad no la cierra. Sigue abierta hasta que
-- se cierre el caso, el asistente sigue sin responder y lo que escribe el
-- cliente queda en ese caso (RF-DER-03). `id_cliente` queda NULL hasta que
-- la persona se identifica. `asistente_suspendido` implementa la regla de
-- que el bot deja de responder tras una derivación, hasta que se cierre el
-- caso.
CREATE TABLE conversacion (
  id_conversacion      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_telefono          INT UNSIGNED NOT NULL,
  id_cliente           INT UNSIGNED NULL,
  fecha_inicio         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_fin            DATETIME     NULL,
  asistente_suspendido BOOLEAN      NOT NULL DEFAULT FALSE,
  PRIMARY KEY (id_conversacion),
  KEY ix_conversacion_telefono_fin (id_telefono, fecha_fin),
  CONSTRAINT fk_conversacion_telefono FOREIGN KEY (id_telefono) REFERENCES telefono (id_telefono),
  CONSTRAINT fk_conversacion_cliente  FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente),
  CONSTRAINT ck_conversacion_fechas   CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
) ENGINE = InnoDB;

-- Un caso por consulta; puede contener varios mensajes hasta resolverse.
-- `id_tipo_consulta` es el tipo que detecta el asistente; queda NULL
-- mientras no se conoce, por ejemplo al abrir el caso con el primer
-- mensaje.
-- El estado no se guarda, se deduce de las fechas: abierto (sin derivar,
-- tomar ni cerrar), derivado (fecha_derivacion sin fecha_toma), en atención
-- (fecha_toma sin fecha_cierre) y cerrado (fecha_cierre). Reabrir un caso
-- es vaciar fecha_cierre.
CREATE TABLE caso (
  id_caso             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_conversacion     INT UNSIGNED NOT NULL,
  id_tipo_consulta    INT UNSIGNED NULL,
  id_usuario_asignado INT UNSIGNED NULL,
  id_nivel_riesgo     INT UNSIGNED NULL,
  fecha_apertura      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_derivacion    DATETIME     NULL,
  fecha_toma          DATETIME     NULL,
  fecha_cierre        DATETIME     NULL,
  motivo_derivacion   VARCHAR(255) NULL,
  PRIMARY KEY (id_caso),
  KEY ix_caso_conversacion (id_conversacion),
  KEY ix_caso_apertura (fecha_apertura),
  KEY ix_caso_cierre (fecha_cierre),
  KEY ix_caso_derivacion_sin_tomar (fecha_derivacion, fecha_toma),
  CONSTRAINT fk_caso_conversacion  FOREIGN KEY (id_conversacion) REFERENCES conversacion (id_conversacion),
  CONSTRAINT fk_caso_tipo_consulta FOREIGN KEY (id_tipo_consulta) REFERENCES tipo_consulta (id_tipo_consulta),
  CONSTRAINT fk_caso_usuario       FOREIGN KEY (id_usuario_asignado) REFERENCES usuario (id_usuario),
  CONSTRAINT fk_caso_nivel_riesgo  FOREIGN KEY (id_nivel_riesgo) REFERENCES nivel_riesgo (id_nivel_riesgo),
  -- Orden de las fechas: apertura <= derivación <= toma <= cierre.
  CONSTRAINT ck_caso_fechas CHECK (
    (fecha_derivacion IS NULL OR fecha_derivacion >= fecha_apertura)
    AND (fecha_toma IS NULL OR fecha_toma >= COALESCE(fecha_derivacion, fecha_apertura))
    AND (fecha_cierre IS NULL OR fecha_cierre >= COALESCE(fecha_toma, fecha_derivacion, fecha_apertura))),
  -- Un caso tomado tiene un responsable.
  CONSTRAINT ck_caso_toma CHECK (fecha_toma IS NULL OR id_usuario_asignado IS NOT NULL)
) ENGINE = InnoDB;

-- Cada mensaje del caso, con su origen. `fecha_hora` guarda milisegundos
-- para ordenar los mensajes que llegan en el mismo segundo.
CREATE TABLE mensaje (
  id_mensaje        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_caso           INT UNSIGNED NOT NULL,
  id_origen_mensaje INT UNSIGNED NOT NULL,
  contenido         TEXT         NOT NULL,
  fecha_hora        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id_mensaje),
  KEY ix_mensaje_caso_fecha (id_caso, fecha_hora),
  CONSTRAINT fk_mensaje_caso   FOREIGN KEY (id_caso) REFERENCES caso (id_caso),
  CONSTRAINT fk_mensaje_origen FOREIGN KEY (id_origen_mensaje) REFERENCES origen_mensaje (id_origen_mensaje)
) ENGINE = InnoDB;

-- Datos que junta el asistente de un cliente nuevo. El alta la confirma
-- un operador: ahí se crea el cliente y se vincula con `id_cliente`.
-- `nombre_declarado` y `dni_declarado` se guardan tal como los escribió la
-- persona. `id_telefono` es un teléfono de contacto que declara, si es
-- distinto del número de la conversación (ese sale del caso).
CREATE TABLE prospecto (
  id_prospecto        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_caso             INT UNSIGNED NOT NULL,
  id_cliente          INT UNSIGNED NULL,
  id_telefono         INT UNSIGNED NULL,
  id_estado_prospecto INT UNSIGNED NOT NULL,
  nombre_declarado    VARCHAR(200) NULL,
  dni_declarado       VARCHAR(15)  NULL,
  observaciones       TEXT         NULL,
  fecha_registro      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_prospecto),
  UNIQUE KEY uk_prospecto_caso (id_caso),
  CONSTRAINT fk_prospecto_caso     FOREIGN KEY (id_caso) REFERENCES caso (id_caso),
  CONSTRAINT fk_prospecto_cliente  FOREIGN KEY (id_cliente) REFERENCES cliente (id_cliente),
  CONSTRAINT fk_prospecto_telefono FOREIGN KEY (id_telefono) REFERENCES telefono (id_telefono),
  CONSTRAINT fk_prospecto_estado   FOREIGN KEY (id_estado_prospecto) REFERENCES estado_prospecto (id_estado_prospecto)
) ENGINE = InnoDB;

-- =====================================================================
-- VERIFICACIÓN Y SUPERVISIÓN
-- =====================================================================

-- Cada texto de respuesta es una fila propia y no se pisa: la que genera el
-- asistente (`id_usuario` NULL), la que escribe un operador (`id_usuario`
-- es el empleado) y la que corrige a otra (`id_respuesta_origen` apunta a
-- la corregida). `id_mensaje_enviado` solo se completa si la respuesta
-- llegó al cliente. El caso sale del mensaje consultado.
CREATE TABLE respuesta (
  id_respuesta        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_mensaje_consulta INT UNSIGNED NOT NULL,
  id_respuesta_origen INT UNSIGNED NULL,
  id_usuario          INT UNSIGNED NULL,
  id_mensaje_enviado  INT UNSIGNED NULL,
  contenido           TEXT         NOT NULL,
  fecha_hora          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_respuesta),
  UNIQUE KEY uk_respuesta_mensaje_enviado (id_mensaje_enviado),
  KEY ix_respuesta_consulta (id_mensaje_consulta),
  CONSTRAINT fk_respuesta_consulta FOREIGN KEY (id_mensaje_consulta) REFERENCES mensaje (id_mensaje),
  CONSTRAINT fk_respuesta_origen   FOREIGN KEY (id_respuesta_origen) REFERENCES respuesta (id_respuesta),
  CONSTRAINT fk_respuesta_usuario  FOREIGN KEY (id_usuario) REFERENCES usuario (id_usuario),
  CONSTRAINT fk_respuesta_enviado  FOREIGN KEY (id_mensaje_enviado) REFERENCES mensaje (id_mensaje)
) ENGINE = InnoDB;

-- Análisis previo al envío: como máximo una verificación por respuesta.
CREATE TABLE verificacion (
  id_verificacion           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_respuesta              INT UNSIGNED NOT NULL,
  id_resultado_verificacion INT UNSIGNED NOT NULL,
  id_nivel_riesgo           INT UNSIGNED NOT NULL,
  detalle                   TEXT         NULL,
  fecha_hora                DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_verificacion),
  UNIQUE KEY uk_verificacion_respuesta (id_respuesta),
  CONSTRAINT fk_verificacion_respuesta FOREIGN KEY (id_respuesta) REFERENCES respuesta (id_respuesta),
  CONSTRAINT fk_verificacion_resultado
    FOREIGN KEY (id_resultado_verificacion) REFERENCES resultado_verificacion (id_resultado_verificacion),
  CONSTRAINT fk_verificacion_nivel     FOREIGN KEY (id_nivel_riesgo) REFERENCES nivel_riesgo (id_nivel_riesgo)
) ENGINE = InnoDB;

-- Alerta sobre un caso y, si corresponde, sobre una respuesta puntual.
-- Redundancia aceptada: si hay respuesta, `id_caso` tiene que ser el caso
-- de esa respuesta (lo valida el backend). Se mantiene porque hay alertas
-- sin respuesta, como "caso derivado sin tomar".
CREATE TABLE alerta (
  id_alerta           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_caso             INT UNSIGNED NOT NULL,
  id_respuesta        INT UNSIGNED NULL,
  id_tipo_alerta      INT UNSIGNED NOT NULL,
  id_nivel_riesgo     INT UNSIGNED NOT NULL,
  id_usuario_atencion INT UNSIGNED NULL,
  fecha_hora          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_atencion      DATETIME     NULL,
  PRIMARY KEY (id_alerta),
  KEY ix_alerta_caso (id_caso),
  KEY ix_alerta_pendiente (fecha_atencion, id_nivel_riesgo),
  CONSTRAINT fk_alerta_caso      FOREIGN KEY (id_caso) REFERENCES caso (id_caso),
  CONSTRAINT fk_alerta_respuesta FOREIGN KEY (id_respuesta) REFERENCES respuesta (id_respuesta),
  CONSTRAINT fk_alerta_tipo      FOREIGN KEY (id_tipo_alerta) REFERENCES tipo_alerta (id_tipo_alerta),
  CONSTRAINT fk_alerta_nivel     FOREIGN KEY (id_nivel_riesgo) REFERENCES nivel_riesgo (id_nivel_riesgo),
  CONSTRAINT fk_alerta_usuario   FOREIGN KEY (id_usuario_atencion) REFERENCES usuario (id_usuario),
  CONSTRAINT ck_alerta_fechas    CHECK (fecha_atencion IS NULL OR fecha_atencion >= fecha_hora),
  -- Una alerta atendida registra quién la atendió y cuándo.
  CONSTRAINT ck_alerta_atencion  CHECK ((fecha_atencion IS NULL) = (id_usuario_atencion IS NULL))
) ENGINE = InnoDB;

-- Registro con valor probatorio. `id_usuario` NULL = lo hizo el asistente.
-- Solo admite inserciones: los triggers del final del script rechazan
-- cualquier UPDATE o DELETE.
CREATE TABLE auditoria (
  id_auditoria INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_usuario   INT UNSIGNED NULL,
  entidad      VARCHAR(50)  NOT NULL,
  id_registro  INT UNSIGNED NOT NULL,
  accion       VARCHAR(50)  NOT NULL,
  detalle      TEXT         NULL,
  fecha_hora   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_auditoria),
  KEY ix_auditoria_entidad (entidad, id_registro),
  KEY ix_auditoria_fecha (fecha_hora),
  CONSTRAINT fk_auditoria_usuario FOREIGN KEY (id_usuario) REFERENCES usuario (id_usuario)
) ENGINE = InnoDB;

-- =====================================================================
-- ACCIONES CRÍTICAS
-- =====================================================================

-- El asistente nunca ejecuta la acción: registra la solicitud en estado
-- pendiente y una persona autorizada la aprueba o la rechaza, dejando
-- asentado quién decidió, cuándo y con qué fundamento (RF-APR-03).
CREATE TABLE solicitud_accion (
  id_solicitud        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_caso             INT UNSIGNED NOT NULL,
  id_poliza           INT UNSIGNED NULL,
  id_tipo_accion      INT UNSIGNED NOT NULL,
  id_estado_solicitud INT UNSIGNED NOT NULL,
  id_usuario_decision INT UNSIGNED NULL,
  detalle             TEXT         NULL,
  fundamento          TEXT         NULL,
  fecha_solicitud     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_decision      DATETIME     NULL,
  PRIMARY KEY (id_solicitud),
  KEY ix_solicitud_estado (id_estado_solicitud),
  KEY ix_solicitud_caso (id_caso),
  CONSTRAINT fk_solicitud_caso    FOREIGN KEY (id_caso) REFERENCES caso (id_caso),
  CONSTRAINT fk_solicitud_poliza  FOREIGN KEY (id_poliza) REFERENCES poliza (id_poliza),
  CONSTRAINT fk_solicitud_tipo    FOREIGN KEY (id_tipo_accion) REFERENCES tipo_accion (id_tipo_accion),
  CONSTRAINT fk_solicitud_estado  FOREIGN KEY (id_estado_solicitud) REFERENCES estado_solicitud (id_estado_solicitud),
  CONSTRAINT fk_solicitud_usuario FOREIGN KEY (id_usuario_decision) REFERENCES usuario (id_usuario),
  CONSTRAINT ck_solicitud_fechas  CHECK (fecha_decision IS NULL OR fecha_decision >= fecha_solicitud),
  -- Una decisión registra quién, cuándo y con qué fundamento.
  CONSTRAINT ck_solicitud_decision CHECK (
    (fecha_decision IS NULL) = (id_usuario_decision IS NULL)
    AND (fecha_decision IS NULL OR fundamento IS NOT NULL))
) ENGINE = InnoDB;

-- =====================================================================
-- AUDITORÍA INALTERABLE (RF-SUP-06)
-- =====================================================================

-- Rechazan cualquier UPDATE o DELETE sobre `auditoria`, venga de quien
-- venga. TRUNCATE y DROP no pasan por triggers, y un usuario con el permiso
-- TRIGGER puede borrar estos triggers y después modificar la auditoría
-- (probado el 21/09/2026 con los permisos del compose). En producción el
-- usuario de la aplicación no debe tener DROP, TRIGGER ni ALTER.
-- Ojo: con el log binario activo (el default de MySQL 8.4), crear triggers
-- exige privilegios de administrador. Si el script lo corre el usuario de
-- la aplicación, MySQL tiene que arrancar con --disable-log-bin (alcanza en
-- desarrollo); si lo corre root, no hace falta nada.
CREATE TRIGGER trg_auditoria_no_modificar
  BEFORE UPDATE ON auditoria FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La auditoría no se puede modificar';

CREATE TRIGGER trg_auditoria_no_borrar
  BEFORE DELETE ON auditoria FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La auditoría no se puede borrar';
