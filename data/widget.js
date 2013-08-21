'use strict';

const google_oauth2 = document.getElementById('google-oauth2');
google_oauth2.onclick = function() {
  self.port.emit('google-oauth2');
};
