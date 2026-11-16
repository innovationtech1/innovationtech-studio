// La cara de NOVA: el sello de InnovationTECH dentro de un círculo.
// «Respira» mientras piensa o habla y late 3 veces cuando trae una sugerencia.
// Sin animación si el aparato pide menos movimiento (prefers-reduced-motion, en globals.css).

export type EstadoNova = "quieta" | "pensando" | "hablando" | "aviso";

export default function NovaAvatar({ estado, tamano = 40 }: { estado: EstadoNova; tamano?: number }) {
  return (
    <span className={`nova-avatar ${estado}`} style={{ width: tamano, height: tamano }} aria-hidden>
      <img src="/icons/icon-192.png" alt="" width={tamano} height={tamano} />
    </span>
  );
}
