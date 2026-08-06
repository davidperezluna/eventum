import { Injectable, Type, ComponentRef } from '@angular/core';

import { BehaviorSubject } from 'rxjs';

import { AlertService } from '../../services/alert.service';

import { DrawerRef } from './drawer-ref';

import { isEvDrawerContent } from './drawer-content.interface';

import {

  EV_DRAWER_DEFAULT_STATE,

  EvDrawerCloseReason,

  EvDrawerConfig,

  EvDrawerOpenConfig,

  EvDrawerShellPatch,

  EvDrawerState,

} from './drawer.types';



interface ActiveDrawerSession {

  ref: DrawerRef<unknown>;

  config: EvDrawerOpenConfig;

  contentRef: ComponentRef<unknown> | null;

  generation: number;

}



@Injectable({

  providedIn: 'root',

})

export class DrawerService {

  private readonly stateSubject = new BehaviorSubject<EvDrawerState>(EV_DRAWER_DEFAULT_STATE);

  private session: ActiveDrawerSession | null = null;

  private hostRegistered = false;

  private openGeneration = 0;



  readonly state$ = this.stateSubject.asObservable();



  constructor(private readonly alertService: AlertService) {}



  registerHost(): void {

    this.hostRegistered = true;

  }



  unregisterHost(): void {

    this.hostRegistered = false;

    this.dismissActiveSession(true);

  }



  get isHostReady(): boolean {

    return this.hostRegistered;

  }



  getSession(): ActiveDrawerSession | null {

    return this.session;

  }



  getOpenGeneration(): number {

    return this.openGeneration;

  }



  open<TComponent, TData = unknown, TResult = unknown>(

    component: Type<TComponent>,

    config: EvDrawerConfig<TData>,

  ): DrawerRef<TResult> {

    if (!this.hostRegistered) {

      console.warn(

        '[DrawerService] ev-drawer-host no está montado. Añádelo al layout antes de abrir drawers.',

      );

    }



    this.dismissActiveSession(false);



    this.openGeneration += 1;

    const generation = this.openGeneration;



    const ref = new DrawerRef<TResult>(

      (reason, requestingRef) => this.requestClose(reason, requestingRef),

      (patch) => this.patchShell(patch),

    );



    this.session = {

      ref: ref as DrawerRef<unknown>,

      config: { ...config, component: component as Type<unknown> },

      contentRef: null,

      generation,

    };



    this.stateSubject.next({

      open: true,

      closing: false,

      title: config.title,

      description: config.description,

      icon: config.icon,

      size: config.size ?? 'md',

      loading: config.loading ?? false,

      closeOnBackdrop: config.closeOnBackdrop ?? true,

      closeOnEscape: config.closeOnEscape ?? true,

      showCloseButton: config.showCloseButton ?? true,

    });



    return ref;

  }



  attachContentRef(contentRef: ComponentRef<unknown>): void {

    if (!this.session) {

      return;

    }

    this.session.contentRef = contentRef;

  }



  patchShell(patch: EvDrawerShellPatch): void {

    const current = this.stateSubject.value;

    if (!current.open && !current.closing) {

      return;

    }

    this.stateSubject.next({

      ...current,

      title: patch.title ?? current.title,

      description: patch.description ?? current.description,

      icon: patch.icon ?? current.icon,

      size: patch.size ?? current.size,

      loading: patch.loading ?? current.loading,

      closeOnBackdrop: patch.closeOnBackdrop ?? current.closeOnBackdrop,

      closeOnEscape: patch.closeOnEscape ?? current.closeOnEscape,

      showCloseButton: patch.showCloseButton ?? current.showCloseButton,

    });

  }



  async requestClose(

    reason: EvDrawerCloseReason,

    requestingRef?: DrawerRef<unknown>,

  ): Promise<boolean> {

    if (!this.session) {

      return true;

    }



    if (requestingRef && requestingRef !== this.session.ref) {

      return false;

    }



    const allowed = await this.canDiscardChanges();

    if (!allowed) {

      return false;

    }



    this.stateSubject.next({

      ...this.stateSubject.value,

      open: false,

      closing: true,

      loading: false,

    });

    return true;

  }



  finalizeClose(): void {

    const ref = this.session?.ref;

    this.session = null;

    this.stateSubject.next(EV_DRAWER_DEFAULT_STATE);

    ref?.internalFinish();

  }



  private dismissActiveSession(finishRef: boolean): void {

    if (!this.session) {

      if (this.stateSubject.value.open || this.stateSubject.value.closing) {

        this.stateSubject.next(EV_DRAWER_DEFAULT_STATE);

      }

      return;

    }



    const ref = this.session.ref;

    this.session = null;

    this.stateSubject.next(EV_DRAWER_DEFAULT_STATE);

    if (finishRef) {

      ref.internalFinish(undefined);

    }

  }



  private async canDiscardChanges(): Promise<boolean> {

    const ref = this.session?.ref;

    const instance = this.session?.contentRef?.instance;



    const hasUnsaved =

      ref?.hasPendingChanges === true ||

      (isEvDrawerContent(instance) && instance.evDrawerHasUnsavedChanges?.() === true);



    if (!hasUnsaved) {

      return true;

    }



    const customPrompt = isEvDrawerContent(instance) ? instance.evDrawerDiscardPrompt?.() : undefined;

    return this.alertService.confirm(

      customPrompt?.title ?? 'Cambios sin guardar',

      customPrompt?.message ?? 'Tienes cambios que no se han guardado. ¿Deseas salir sin guardar?',

      customPrompt?.confirmText ?? 'Salir sin guardar',

      customPrompt?.cancelText ?? 'Seguir editando',

    );

  }

}


