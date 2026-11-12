import test from "node:test";
import assert from "node:assert/strict";
import { FUNDIDO, bajadasDeMusica, gananciaClip, tramosConSonido } from "./reel-sonido";

const cerca = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test("gananciaClip: entra y sale con un fundido corto", () => {
  assert.equal(FUNDIDO, 0.15);
  cerca(gananciaClip(0, 4), 0);
  cerca(gananciaClip(0.075, 4), 0.5);
  cerca(gananciaClip(2, 4), 1);
  cerca(gananciaClip(3.925, 4), 0.5);
  cerca(gananciaClip(4, 4), 0);
  assert.equal(gananciaClip(4.1, 4), 0);
  assert.equal(gananciaClip(-0.1, 4), 0);
});

test("gananciaClip: en un clip muy corto no truena ni pasa de 1", () => {
  cerca(gananciaClip(0.1, 0.2), 1);
  cerca(gananciaClip(0.05, 0.2), 0.5);
  for (let t = 0; t <= 0.2; t += 0.01) assert.ok(gananciaClip(t, 0.2) <= 1 && gananciaClip(t, 0.2) >= 0);
  assert.equal(gananciaClip(0, 0), 0);
});

test("tramosConSonido: junta los videos con sonido que van seguidos", () => {
  const con = { sonido: true };
  const sin = { sonido: false };
  assert.deepEqual(
    tramosConSonido([{ segundos: 3 }, { segundos: 4, video: con }, { segundos: 2, video: con }, { segundos: 5, video: sin }, { segundos: 1, video: con }]),
    [
      { desde: 3, hasta: 9 },
      { desde: 14, hasta: 15 },
    ],
  );
  assert.deepEqual(tramosConSonido([{ segundos: 3 }, { segundos: 2, video: sin }]), []);
});

test("bajadasDeMusica: la voz y el sonido de los clips, juntando lo que queda pegado", () => {
  assert.deepEqual(bajadasDeMusica(null, []), []);
  assert.deepEqual(bajadasDeMusica(10, []), [{ desde: 0.3, hasta: 10.3 }]);
  assert.deepEqual(bajadasDeMusica(null, [{ desde: 3, hasta: 9 }]), [{ desde: 3, hasta: 9 }]);
  // la voz termina en 10.3 y un clip suena desde 10.8: es una sola bajada
  assert.deepEqual(bajadasDeMusica(10, [{ desde: 10.8, hasta: 14 }]), [{ desde: 0.3, hasta: 14 }]);
  // con hueco suficiente, la música vuelve a subir entre los dos
  assert.deepEqual(bajadasDeMusica(5, [{ desde: 9, hasta: 12 }]), [
    { desde: 0.3, hasta: 5.3 },
    { desde: 9, hasta: 12 },
  ]);
  // un clip dentro de la voz no cambia nada
  assert.deepEqual(bajadasDeMusica(10, [{ desde: 2, hasta: 4 }]), [{ desde: 0.3, hasta: 10.3 }]);
});
