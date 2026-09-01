import { redirect } from 'next/navigation';

/** The app has one entry point: the recipe list. */
export default function Home() {
  redirect('/recipes');
}
