import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PwaInstallBanner } from './components/pwa-install-banner/pwa-install-banner';
import { PwaUpdateService } from './services/pwa-update.service';
import { cleanupStaleAngularServiceWorker } from './utils/pwa-cleanup';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, PwaInstallBanner],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  protected readonly title = signal('admin-panel');
  private readonly pwaUpdate = inject(PwaUpdateService);

  async ngOnInit(): Promise<void> {
    await cleanupStaleAngularServiceWorker();
    this.pwaUpdate.init();
  }
}
