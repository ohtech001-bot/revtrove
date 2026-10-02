import {showMessage,askConfirmation,installSiteDialogs} from './lib/site-dialogs'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from './router'
import App from './App'
import './styles.css'
import './lib/site-dialogs.css'
installSiteDialogs()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><BrowserRouter><App /></BrowserRouter></React.StrictMode>,
)

