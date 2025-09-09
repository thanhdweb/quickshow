import React from 'react'
import Navbar from './components/Navbar'
import { Route, Routes, useLocation } from 'react-router-dom'
import Home from './page/Home';
import Movies from './page/Movies';
import MovieDetails from './page/MovieDetails';
import SeatLayout from './page/SeatLayout';
import MyBookings from './page/MyBookings';
import Favorite from './page/Favorite';
import { Toaster } from 'react-hot-toast'
import Footer from './components/Footer';
import Layout from './page/admin/Layout';
import AddShows from './page/admin/AddShows';
import ListShows from './page/admin/ListShows';
import Dashboard from './page/admin/Dashboard';
import ListBookings from './page/admin/ListBookings';
import { useAppContext } from './context/AppContext';
import { SignIn } from '@clerk/clerk-react';
import Loading from './components/ui/Loading';

const App = () => {
  // Check if the current route is an admin route (Kiểm tra xem tuyến đường hiện tại có phải là tuyến đường quản trị không)
  const isAdminRoute = useLocation().pathname.startsWith('/admin')

  const { user } = useAppContext()

  return (
    <>
      <Toaster />
      {!isAdminRoute && <Navbar />}
      <Routes>
        <Route path='/' element={<Home />} />
        <Route path='/movies' element={<Movies />} />
        <Route path='/movies/:id' element={<MovieDetails />} />
        <Route path='/movies/:id/:date' element={<SeatLayout />} />
        <Route path='/my-bookings' element={<MyBookings />} />
        <Route path='/loading/:nextUrl' element={<Loading />} />

        <Route path='/favorite' element={<Favorite />} />
        {/* Admin routes */}
        <Route path='/admin/*' element={user ? <Layout /> : (
          <div className='min-h-screen flex justify-center items-center'>
            <SignIn fallbackRedirectUrl={'/admin'} />
          </div>
        )}>
          <Route index element={<Dashboard />} />
          <Route path='add-shows' element={<AddShows />} />
          <Route path='list-shows' element={<ListShows />} />
          <Route path='list-bookings' element={<ListBookings />} />
        </Route>
      </Routes>
      {!isAdminRoute && <Footer />}
    </>
  )
}

export default App
