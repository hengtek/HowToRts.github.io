//How big the grid is in pixels
var gridWidthPx = 800, gridHeightPx = 448;
var gridPx = 32;

//Grid size in actual units
var gridWidth = gridWidthPx / gridPx;
var gridHeight = gridHeightPx / gridPx;

//Storage for the current enemies
var enemies = new Array();

//Defines an enemy that moves
Enemy = function (pos) {
	this.position = pos;
	this.rotation = 0;

	this.speed = 4; //grid squares / second

	this.pathIndex = 1;
};

var path = [
	new Vector2(0, 3),
	new Vector2(3, 3),
	new Vector2(3, 5),
	new Vector2(6, 5),
	new Vector2(6, 2),
	new Vector2(4, 2)
];

//Called to start the game
function startGame() {
}

var timeBetweenSpawns = 1;
var timeToNextSpawn = 0;

//called periodically to update the game
//dt is the change of time since the last update (in seconds)
function gameTick(dt) {

	//move enemies
	for (var i = enemies.length - 1; i >= 0; i--) {
		var e = enemies[i];

		var distanceToMove = dt * e.speed;
		var vectorToTarget = path[e.pathIndex].minus(e.position);
		var distanceToTarget = vectorToTarget.length();

		//We assume you'll never move more than one path point in a game tick
		if (distanceToTarget < distanceToMove) {
			e.position = path[e.pathIndex];
			e.pathIndex++;

			if (e.pathIndex == path.length) {
				enemies.splice(i, 1);
				continue;
			}

			//recalculate for the new destination
			distanceToMove -= distanceToTarget;
			vectorToTarget = path[e.pathIndex].minus(e.position);
			distanceToTarget = vectorToTarget.length();
		}

		e.position = e.position.plus(vectorToTarget.normalize().mul(distanceToMove));
		e.rotation = vectorToTarget.angle();
	}

	timeToNextSpawn -= dt;
	if (timeToNextSpawn <= 0) {
		enemies.push(new Enemy(path[0]));
		timeToNextSpawn += timeBetweenSpawns;
	}
}