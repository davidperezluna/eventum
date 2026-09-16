-- Revierte la política de contacto que provocaba recursión infinita en usuarios.
-- El login debe poder consultar el perfil sin depender de compras/eventos.

DROP POLICY IF EXISTS usuarios_select_organizador_comprado ON public.usuarios;
