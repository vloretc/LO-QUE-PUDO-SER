# LO QUE PUDO SER

Cartel interactivo en HTML, CSS y JavaScript. Dos perfiles SVG originales inspirados en el moodboard: azul/violeta y rosa/magenta, bordes difusos, luz y distancia. Sin fotografías, partículas ni video permanente.

## Ejecutar

En Mac, abre `iniciar.command` desde Finder (puede requerir clic derecho → Abrir). Abre después **http://localhost:8765** en Chrome o Edge. Mantén abierta la Terminal; Ctrl+C detiene el servidor.

Alternativa con Python 3 instalado, desde esta carpeta:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

En Windows puedes usar `py -m http.server 8765 --bind 127.0.0.1`. No abras index.html mediante file://: los módulos y los permisos necesitan un servidor local o HTTPS. No se necesita npm ni compilar.

## Cámara y prueba

1. La pantalla inicial no pide cámara ni reproduce audio. Pulsa **Entrar con cámara** y elige **Permitir** en el navegador. Si macOS lo solicita, permite también la cámara al navegador en Ajustes del Sistema → Privacidad y seguridad → Cámara.
2. Deja que descargue MediaPipe y el modelo. Necesitas internet para estas dependencias. Los fotogramas permanecen en el navegador; el código no los graba, guarda ni envía.
3. Ilumina la mano desde delante, muestra una sola mano y mantén la palma abierta. Tras confirmarla aparecerá “Palma detectada” y comenzará la experiencia.
4. Usa **Ver seguimiento** para comprobar video, los 21 puntos y el gesto reconocido. Es el diagnóstico de MediaPipe: el monitor cerrado no afecta a la detección.
5. Palma abierta: acercar. Puño: alejar. Una postura intermedia pausa. Mantener un gesto que mueve las figuras sigue contando como actividad. Cuatro segundos sin una interacción efectiva muestran la invitación a continuar.
6. Quita la mano: las figuras se congelan; a los 5 segundos aparece el aviso; a los 10 comienza el retorno suave a detección. En la narrativa final, la ausencia de mano no reinicia.
7. Mantén la palma hasta el casi encuentro. Después del clímax, la derecha se aleja durante 8,5 segundos. Hay 6,5 segundos de contemplación antes de ofrecer el círculo.
8. En el cierre, dibuja un círculo amplio con el puño, en cualquiera de los dos sentidos. El arco y las figuras responden a la trayectoria; solo una vuelta suficientemente completa y cerrada confirma el regreso. Un intento incompleto se desvanece.
9. **Salir** apaga la cámara y suspende el sonido. **Sonido encendido/apagado** permite silenciar.

## Personalizar

Todo está al principio de `script.js`, en **CONFIG**. Recarga la página tras editar.

| Qué cambiar | Dónde |
|---|---|
| Música | Coloca tu archivo en `assets/audio/melancolia.mp3`. Se reproduce en bucle. Sin archivo, hay un ambiente original sintetizado de respaldo. |
| Siluetas | Por defecto se dibujan con SVG. Para PNG: coloca `assets/images/silueta-izquierda.png` y `silueta-derecha.png`, cambia `silhouetteMode` a `'png'`. |
| Colores | `colors.left` y `colors.right`: base, violeta intermedio y luz del borde. Con PNG sus colores originales se conservan; CONFIG modifica el resplandor. |
| Velocidades | `approachSpeed` y `separationSpeed`, en unidades de progreso por segundo. |
| Distancias | `minDistance` / `maxDistance`, fracciones del ancho de pantalla. Mantén `minDistance` positivo. |
| Luz y definición | `minBrightness`, `maxBrightness`, `minGlow`, `maxGlow`, `minBlur`, `maxBlur`, `minOpacity`, `maxOpacity`. Blur y glow en píxeles. |
| Volumen | `minVolume` / `maxVolume`, de 0 a 1. El cambio se interpola, sin saltos. |
| Tiempos | `inactivityTime`, `lostHandTime`, `resetDetectionTime`, `climaxDuration`, `separationDuration`, `closingDuration`, en milisegundos. |

### PNG opcionales

Usa lienzos transparentes con proporción **400 × 600**, sin estirar el dibujo. Perfil izquierdo mirando a la derecha, punta de la nariz en x≈350; derecho mirando a la izquierda, nariz en x≈50. Ambos a la misma altura. Esa alineación mantiene una separación mínima coherente con los SVG. La lógica de posición, opacidad, brillo y blur no cambia. Si una imagen no carga, permanece el SVG. No se incluyen PNG de relleno ni una canción ajena.

### Sensibilidad de palma y puño

Se comparan distancias y ángulos de los cuatro dedos largos; el pulgar queda libre. `palmExtendedCount: 4` y `fistCurledCount: 4` requieren los cuatro; bajar a 3 tolera un dedo poco visible pero admite más falsos positivos. `openFingerRatio` más bajo facilita reconocer palma; `closedFingerRatio` más alto facilita reconocer puño. Cambia de a 0,05 y comprueba el monitor. `gestureConfirmTime` mayor exige mantener más tiempo un gesto y evita cambios accidentales. `landmarkSmoothing` menor filtra más, pero responde más lento. `minDetectionConfidence` y `minTrackingConfidence` controlan la confianza del detector, no la postura.

### Sensibilidad del círculo

`circleMinRadius` es el radio mínimo como fracción de la altura de la cámara (0,065 = 6,5%). El eje horizontal se corrige por la proporción del video. `circleTolerance` es el error radial relativo permitido: menor = círculo más regular. `circleMaxDuration` define el tiempo máximo (5.500 ms). `circleMinTurn` exige 1,8π radianes (90% de vuelta), y `circleClosure` exige terminar cerca del inicio. `circleMinCoherence` rechaza el zigzag o cambios de dirección. Solo se acumula trayectoria con puño confirmado. Una pausa de 900 ms cancela suavemente el intento.

## Tecnología y privacidad

**MediaPipe Tasks Vision 0.10.21**, cargado como módulo desde jsDelivr después del clic. El runtime WebAssembly viene del mismo CDN; el modelo Hand Landmarker se descarga del almacenamiento oficial de Google. Se intenta GPU y, si falla, CPU. La inferencia se limita a 20 fps y las animaciones usan requestAnimationFrame. La inferencia es síncrona: en equipos lentos se puede reducir `detectionFPS` (o migrarla a un Web Worker).

Referencia oficial: https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js

Las peticiones externas descargan recursos; no incluyen imágenes de cámara. Para una instalación sin internet, descarga el paquete completo (módulo y carpeta wasm) y el modelo, y cambia `mediapipe` y `model` en CONFIG a sus rutas locales. No hay analítica, cookies ni almacenamiento persistente implementado.

## Validación y límites

Verificados: sintaxis JavaScript; clasificación con coordenadas sintéticas de palma/puño; círculos completos en ambos sentidos y rechazo de semicírculos, movimientos pequeños, líneas, retrocesos y tiempo excedido; transiciones de interacción, pérdida de mano, clímax y cierre persistente. Verificada la disponibilidad HTTP del módulo, WASM y modelo.

**Pendiente de prueba física:** calidad de detección con tu cámara, iluminación y gestos reales. El entorno de entrega no permitió completar la inspección visual en un navegador ni probar la inferencia con una webcam. Las pruebas sintéticas no sustituyen esa calibración. El botón de seguimiento está preparado para hacerla.

## Archivos

- `index.html`: estructura, textos e iconos vectoriales.
- `style.css`: composición, tipografía, efectos y adaptación a pantalla.
- `script.js`: CONFIG, SVG, audio, gestos, círculo y máquina de estados comentada.
- `iniciar.command`: servidor local para Mac, sin instalación automática.
- `assets/audio/` y `assets/images/`: recursos opcionales de reemplazo.
