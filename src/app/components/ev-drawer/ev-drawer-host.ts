import {

  Component,

  OnInit,

  OnDestroy,

  AfterViewInit,

  ViewChild,

  ViewContainerRef,

  EnvironmentInjector,

  Injector,

  ComponentRef,

  createEnvironmentInjector,

  ChangeDetectorRef,

  NgZone,

} from '@angular/core';

import { CommonModule } from '@angular/common';

import { Subscription } from 'rxjs';

import { EvDrawer } from './ev-drawer';

import { DrawerService } from '../../core/drawer/drawer.service';

import { DrawerRef } from '../../core/drawer/drawer-ref';

import { EV_DRAWER_DATA } from '../../core/drawer/drawer.tokens';

import { EV_DRAWER_DEFAULT_STATE, EvDrawerState } from '../../core/drawer/drawer.types';



@Component({

  selector: 'ev-drawer-host',

  standalone: true,

  imports: [CommonModule, EvDrawer],

  templateUrl: './ev-drawer-host.html',

})

export class EvDrawerHost implements OnInit, AfterViewInit, OnDestroy {

  @ViewChild('contentOutlet', { read: ViewContainerRef })

  contentOutlet?: ViewContainerRef;



  state: EvDrawerState = EV_DRAWER_DEFAULT_STATE;

  private subscription?: Subscription;

  private contentRef: ComponentRef<unknown> | null = null;

  private mountedGeneration = -1;

  private pendingMountGeneration: number | null = null;



  constructor(

    private readonly drawerService: DrawerService,

    private readonly environmentInjector: EnvironmentInjector,

    private readonly injector: Injector,

    private readonly cdr: ChangeDetectorRef,

    private readonly ngZone: NgZone,

  ) {}



  ngOnInit(): void {

    this.drawerService.registerHost();

    this.subscription = this.drawerService.state$.subscribe((state) => {

      const wasOpen = this.state.open;

      const wasClosing = this.state.closing;

      this.state = state;

      this.cdr.markForCheck();



      if (state.open && !state.closing) {

        const generation = this.drawerService.getOpenGeneration();

        if (generation !== this.mountedGeneration) {

          this.scheduleMountContent(generation);

        }

      } else if (!state.open && !state.closing && (wasOpen || wasClosing)) {

        this.pendingMountGeneration = null;

        this.destroyContent();

        this.mountedGeneration = -1;

      }



      this.cdr.detectChanges();

    });

  }



  ngAfterViewInit(): void {

    if (this.state.open && !this.state.closing) {

      const generation = this.drawerService.getOpenGeneration();

      if (generation !== this.mountedGeneration) {

        this.scheduleMountContent(generation);

      }

    }

  }



  ngOnDestroy(): void {

    this.subscription?.unsubscribe();

    this.destroyContent();

    this.drawerService.unregisterHost();

  }



  onCloseRequested(): void {

    void this.drawerService.requestClose('close-button', this.drawerService.getSession()?.ref);

  }



  onDrawerClosed(): void {

    this.pendingMountGeneration = null;

    this.destroyContent();

    this.mountedGeneration = -1;

    this.drawerService.finalizeClose();

    this.cdr.detectChanges();

  }



  private scheduleMountContent(generation: number): void {

    this.pendingMountGeneration = generation;

    queueMicrotask(() => this.mountContent(generation, 0));

  }



  private mountContent(generation: number, attempt: number): void {

    if (this.pendingMountGeneration !== generation) {

      return;

    }



    const session = this.drawerService.getSession();

    if (!session || !this.state.open || this.state.closing || session.generation !== generation) {

      return;

    }



    if (!this.contentOutlet) {

      if (attempt < 8) {

        requestAnimationFrame(() => {

          this.ngZone.run(() => this.mountContent(generation, attempt + 1));

        });

      }

      return;

    }



    this.destroyContent();



    const childInjector = createEnvironmentInjector(

      [

        { provide: DrawerRef, useValue: session.ref },

        { provide: EV_DRAWER_DATA, useValue: session.config.data ?? null },

      ],

      this.environmentInjector,

    );



    this.contentRef = this.contentOutlet.createComponent(session.config.component, {

      environmentInjector: childInjector,

      injector: this.injector,

    });



    if (session.config.inputs) {

      Object.entries(session.config.inputs).forEach(([key, value]) => {

        (this.contentRef!.instance as Record<string, unknown>)[key] = value;

      });

    }

    this.contentRef.changeDetectorRef.detectChanges();



    this.drawerService.attachContentRef(this.contentRef);

    this.mountedGeneration = generation;

    this.pendingMountGeneration = null;

    this.cdr.detectChanges();

  }



  private destroyContent(): void {

    if (!this.contentRef) {

      this.contentOutlet?.clear();

      return;

    }

    this.contentRef.destroy();

    this.contentRef = null;

    this.contentOutlet?.clear();

  }

}


