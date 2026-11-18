"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * Registro global de las pantallas con cambios sin guardar. El botón
 * "Actualizar" lo consulta para no pisar nada: avisa y deja guardar primero.
 */
type Registro = { sinGuardar: boolean; nombre: string; guardar?: () => void };
const registros = new Map<string, Registro>();

export function cambiosSinGuardar() {
  return [...registros.values()].filter((r) => r.sinGuardar);
}

/** Avisa al botón "Actualizar" que esta pantalla tiene cambios sin guardar (y cómo guardarlos). */
export function useCambiosPendientes(sinGuardar: boolean, nombre: string, guardar?: () => void) {
  const id = useId();
  const guardarActual = useRef(guardar);
  useEffect(() => {
    guardarActual.current = guardar;
  });
  const conGuardar = !!guardar;
  useEffect(() => {
    registros.set(id, { sinGuardar, nombre, guardar: conGuardar ? () => guardarActual.current?.() : undefined });
    return () => {
      registros.delete(id);
    };
  }, [id, sinGuardar, nombre, conGuardar]);
}

/**
 * Cuando llegan datos nuevos del servidor (al tocar "Actualizar" o después de
 * guardar), la pantalla los toma, salvo que tenga cambios sin guardar: esos
 * nunca se pisan. Se compara por identidad: cada consulta al servidor trae un objeto nuevo.
 */
export function useDatosDelServidor<T>(datos: T, sinGuardar: boolean, aplicar: (datos: T) => void) {
  const [previos, setPrevios] = useState(datos);
  if (datos !== previos) {
    setPrevios(datos);
    if (!sinGuardar) aplicar(datos);
  }
}
