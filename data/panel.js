'use strict';


addon.port.on('token', function(token) {
  var scope = angular.element(document.body).scope();
  scope.$apply(function(){
    scope.token = token;
  });
});


function TokenControl($scope) {
  window.console.log('TokenControl');
  $scope.title = addon.options.name;
  $scope.token = null;
  $scope.authenticate = function() {
    window.console.log('authenticate clicked');
    addon.port.emit('authenticate');
  };
  $scope.refresh = function() {
    window.console.log('refresh clicked');
    addon.port.emit('refresh');
  };
}
