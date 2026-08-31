import { redirect } from 'next/navigation';

/** The app has one entry point and it is the recipe list, per the brief. */
export default function Home() {
  redirect('/recipes');
}
