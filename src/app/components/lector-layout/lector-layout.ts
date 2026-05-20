import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-lector-layout',
  imports: [RouterOutlet],
  template: '<router-outlet />',
  styleUrl: './lector-layout.css',
})
export class LectorLayout {}
