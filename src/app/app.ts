import { Component } from '@angular/core';
import { AppComponent } from "./app-component/app-component";

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [AppComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
}