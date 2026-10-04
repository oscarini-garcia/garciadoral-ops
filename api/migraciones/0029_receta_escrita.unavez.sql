-- La receta escrita: ingredientes y pasos, uno por línea, para el detalle de
-- una cena (specs/propuesta-recurrentes-y-recetas.html, C1). Los escribe la IA
-- a petición, o quien quiera a mano, y se guardan en la receta para que la
-- próxima vez que se cene ya estén.
ALTER TABLE receta ADD COLUMN ingredientes TEXT;
ALTER TABLE receta ADD COLUMN pasos TEXT;
