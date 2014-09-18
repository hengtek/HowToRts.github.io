//How big the grid is in pixels
var gridWidthPx = 800, gridHeightPx = 448;
var gridPx = 32;

//Grid size in actual units
var gridWidth = gridWidthPx / gridPx;
var gridHeight = gridHeightPx / gridPx;

//Storage for the current agents and obstacles
var agents = new Array();
var obstacles = new Array();

//The physics world
var world = new B2World(B2Vec2.Zero, true);

//Defines an agent that moves
Agent = function (pos) {
	this.rotation = 0;

	this.maxForce = 100; //rate of acceleration
	this.maxSpeed = 6; //grid squares / second

	this.radius = 0.23;

	this.neighbourRadius = 2;

	
	this.maxForceSquared = this.maxForce * this.maxForce;
	this.maxSpeedSquared = this.maxSpeed * this.maxSpeed;

	//Create a physics body for the agent
	var fixDef = new B2FixtureDef();
	var bodyDef = new B2BodyDef();

	fixDef.density = 20.0;
	fixDef.friction = 0.0;
	fixDef.restitution = 0.0;
	fixDef.shape = new B2CircleShape(this.radius);

	bodyDef.type = B2Body.b2_dynamicBody;
	//bodyDef.linearDamping = 0.1;
	bodyDef.position.SetV(pos);

	this.body = world.CreateBody(bodyDef);
	this.fixture = this.body.CreateFixture(fixDef);
};
Agent.prototype.position = function () {
	return this.body.GetPosition();
};
Agent.prototype.velocity = function () {
	return this.body.GetLinearVelocity();
};

var destination = new B2Vec2(gridWidth - 1, gridHeight / 2); //middle right

//Called to start the game
function startGame() {
	//for (var yPos = 1; yPos < gridHeight - 1; yPos++) {
	//	agents.push(new Agent(new B2Vec2(0, yPos)));
	//	agents.push(new Agent(new B2Vec2(1, yPos)));
	//	agents.push(new Agent(new B2Vec2(2, yPos)));
	//}

	//for (var i = 0; i < gridHeight; i++) {
	//	if (i == gridHeight / 2 || i == gridHeight / 2 - 1) {
	//		continue;
	//	}
	//	obstacles.push(new B2Vec2(8, i));
	//	obstacles.push(new B2Vec2(7, i));
	//}


	//for (var i = 0; i < 30; i++) {
	//	var x = 1 + Math.floor(Math.random() * (gridWidth - 3));
	//	var y = Math.floor(Math.random() * (gridHeight - 2));
	//	obstacles.push(new B2Vec2(x, y));
	//}

	for (var i = 0; i < obstacles.length; i++) {
		var pos = obstacles[i];

		createObstacleBody(pos);
	}

	generateDijkstraGrid();
	generateFlowField();

	stage.addEventListener('stagemouseup', function (ev) {
		var x = (ev.stageX / gridPx) | 0;
		var y = (ev.stageY / gridPx) | 0;
		var found = false;
		for (var i = 0; i < obstacles.length; i++) {
			if (obstacles[i].x == x && obstacles[i].y == y) {
				world.DestroyBody(obstacles[i].body);
				obstacles.splice(i, 1);
				found = true;
				break;
			}
		}
		
		if (!found) {
			var pos = new B2Vec2(x, y);
			createObstacleBody(pos)
			obstacles.push(pos);
		}
		redrawObstacles();
		
		generateDijkstraGrid();
		generateFlowField();

		updateWeightsAndFieldVisuals(); //Call in to the renderer to redraw the weights and flow field
	});
}

function createObstacleBody(pos) {
	//Create a physics body for the agent
	var fixDef = new B2FixtureDef();
	var bodyDef = new B2BodyDef();

	fixDef.density = 1.0;
	fixDef.friction = 0.5;
	fixDef.restitution = 0.2;
	fixDef.shape = new B2PolygonShape();
	fixDef.shape.SetAsBox(0.5, 0.5);

	bodyDef.type = B2Body.b2_staticBody;
	bodyDef.position.SetV(pos);

	pos.body = world.CreateBody(bodyDef);
	pos.body.CreateFixture(fixDef);
}

function round(val) {
	return val.toFixed(1);
}

var spawnTime = 0;

//called periodically to update the game
//dt is the change of time since the last update (in seconds)
function gameTick(dt) {
	var i, agent;
	
	spawnTime -= dt;
	if (spawnTime < 0) {
		spawnTime += 0.5;
		agents.push(new Agent(new B2Vec2(0, 0)));
		agents.push(new Agent(new B2Vec2(0, (gridHeight - 1) / 4)));
		agents.push(new Agent(new B2Vec2(0, (gridHeight - 0) / 2)));
		agents.push(new Agent(new B2Vec2(0, (gridHeight - 1) * 3 / 4)));
		agents.push(new Agent(new B2Vec2(0, (gridHeight - 1))));
	}
	
	//clean out deadies
	for (i = agents.length - 1; i >= 0; i--) {
		agent = agents[i];
		
		if (agent.position().x > gridWidth) {
			world.DestroyBody(agent.body);
			stage.removeChild(agentBitmaps[agent._id])
			stage.removeChild( agentForceLines[agent._id]);
			agents.splice(i, 1);
		}
	}
	
	
	//Calculate steering and flocking forces for all agents
	for (i = agents.length - 1; i >= 0; i--) {
		agent = agents[i];

		//Work out our behaviours
		var ff = steeringBehaviourFlowField(agent);
		var sep = steeringBehaviourSeparation(agent);
		var alg = steeringBehaviourAlignment(agent);
		var coh = steeringBehaviourCohesion(agent);

		//For visually debugging forces agent.forces = [ff.Copy(), sep.Copy(), alg.Copy(), coh.Copy()];

		agent.forceToApply = ff.Add(sep.Multiply(1)).Add(alg.Multiply(0.3)).Add(coh.Multiply(0.15));

		var lengthSquared = agent.forceToApply.LengthSquared();
		if (lengthSquared > agent.maxForceSquared) {
			agent.forceToApply.Multiply(agent.maxForce / Math.sqrt(lengthSquared));
		}
	}

	//Move agents based on forces being applied (aka physics)
	for (i = agents.length - 1; i >= 0; i--) {
		agent = agents[i];

		//Apply the force
		//console.log(i + ': ' + agent.forceToApply.x + ', ' + agent.forceToApply.y);
		agent.body.ApplyImpulse(agent.forceToApply.Multiply(dt), agent.position());

		//Calculate our new movement angle TODO: Should probably be done after running step
		agent.rotation = agent.velocity().Angle();
	}

	world.Step(dt, 10, 10);
	world.ClearForces();
}

function steeringBehaviourFlowField(agent) {

	//Work out the force to apply to us based on the flow field grid squares we are on.
	//we apply bilinear interpolation on the 4 grid squares nearest to us to work out our force.
	// http://en.wikipedia.org/wiki/Bilinear_interpolation#Nonlinear

	//Top left Coordinate of the 4
	var floor = agent.position().Copy().Floor();

	//The 4 weights we'll interpolate, see http://en.wikipedia.org/wiki/File:Bilininterp.png for the coordinates
	var f00 = (isValid(floor.x, floor.y) ? flowField[floor.x][floor.y] : B2Vec2.Zero).Copy();
	var f01 = (isValid(floor.x, floor.y + 1) ? flowField[floor.x][floor.y + 1] : B2Vec2.Zero).Copy();
	var f10 = (isValid(floor.x + 1, floor.y) ? flowField[floor.x + 1][floor.y] : B2Vec2.Zero).Copy();
	var f11 = (isValid(floor.x + 1, floor.y + 1) ? flowField[floor.x + 1][floor.y + 1] : B2Vec2.Zero).Copy();

	//Do the x interpolations
	var xWeight = agent.position().x - floor.x;

	var top = f00.Multiply(1 - xWeight).Add(f10.Multiply(xWeight));
	var bottom = f01.Multiply(1 - xWeight).Add(f11.Multiply(xWeight));

	//Do the y interpolation
	var yWeight = agent.position().y - floor.y;

	//This is now the direction we want to be travelling in (needs to be normalized)
	var desiredDirection = top.Multiply(1 - yWeight).Add(bottom.Multiply(yWeight));
	desiredDirection.Normalize();

	//If we are centered on a grid square with no vector this will happen
	if (isNaN(desiredDirection.LengthSquared())) {
		return desiredDirection.SetZero();
	}

	return steerTowards(agent, desiredDirection);
}


function steeringBehaviourSeek(agent, dest) {

	if (dest.x == agent.position().x && dest.y == agent.position().y) {
		return new B2Vec2();
	}


	//Desired change of location
	var desired = dest.Copy().Subtract(agent.position());
	//Desired velocity (move there at maximum speed)
	desired.Multiply(agent.maxSpeed / desired.Length());
	//The velocity change we want
	var velocityChange = desired.Subtract(agent.velocity());
	//Convert to a force
	return velocityChange.Multiply(agent.maxForce / agent.maxSpeed);
}

function steeringBehaviourSeparation(agent) {
	var totalForce = new B2Vec2();
	var neighboursCount = 0;

	for (var i = 0; i < agents.length; i++) {
		var a = agents[i];
		if (a != agent) {
			var distance = agent.position().DistanceTo(a.position());
			if (distance < agent.neighbourRadius && distance > 0) {
				//Vector to other agent
				var pushForce = agent.position().Copy().Subtract(a.position());
				var length = pushForce.Normalize(); //Normalize returns the original length
				var r = (agent.radius + a.radius);

				totalForce.Add(pushForce.Multiply(1 - (length / agent.neighbourRadius)))

				neighboursCount++;
			}
		}
	}

	if (neighboursCount == 0) {
		return totalForce; //Zero
	}

	return totalForce.Multiply(agent.maxForce / neighboursCount);
}

function steeringBehaviourCohesion(agent) {
	//Start with just our position
	var centerOfMass = new B2Vec2()//agent.position().Copy();
	var neighboursCount = 0;

	for (var i = 0; i < agents.length; i++) {
		var a = agents[i];
		if (a != agent) {
			var distance = agent.position().DistanceTo(a.position());
			if (distance < agent.neighbourRadius) {
				//sum up the position of our neighbours
				centerOfMass.Add(a.position());
				neighboursCount++;
			}
		}
	}

	if (neighboursCount == 0) {
		return new B2Vec2();
	}

	//Get the average position of ourself and our neighbours
	centerOfMass.Divide(neighboursCount);

	//seek that position
	return steeringBehaviourSeek(agent, centerOfMass);
}

function steeringBehaviourAlignment(agent) {
	var averageHeading = new B2Vec2();
	var neighboursCount = 0;

	//for each of our neighbours (including ourself)
	for (var i = 0; i < agents.length; i++) {
		var a = agents[i];
		var distance = agent.position().DistanceTo(a.position());
		//That are within the max distance and are moving
		if (distance < agent.neighbourRadius && a.velocity().Length() > 0) {
			//Sum up our headings
			var head = a.velocity().Copy();
			head.Normalize();
			averageHeading.Add(head);
			neighboursCount++;
		}
	}

	if (neighboursCount == 0) {
		return averageHeading; //Zero
	}

	//Divide to get the average heading
	averageHeading.Divide(neighboursCount);

	//Steer towards that heading
	return steerTowards(agent, averageHeading);
}

function steerTowards(agent, desiredDirection) {
	//Multiply our direction by speed for our desired speed
	var desiredVelocity = desiredDirection.Multiply(agent.maxSpeed);

	//The velocity change we want
	var velocityChange = desiredVelocity.Subtract(agent.velocity());
	//Convert to a force
	return velocityChange.Multiply(agent.maxForce / agent.maxSpeed);
}

var dijkstraGrid = new Array(gridWidth);
for (var x = 0; x < gridWidth; x++) {
	dijkstraGrid[x] = new Array(gridHeight);
}
var losGrid = new Array(gridWidth);
for (x = 0; x < gridWidth; x++) {
	losGrid[x] = new Array(gridHeight);
}
var flowField = new Array(gridWidth);
for (x = 0; x < gridWidth; x++) {
	flowField[x] = new Array(gridHeight);
}

Math.sign = Math.sign || function (number) { return number > 0 ? 1 : number < 0 ? -1 : 0; };

function generateDijkstraGrid() {
	//Generate an empty grid
	//set all places as weight null, which will stand for unvisited
	for (var x = 0; x < gridWidth; x++) {
		var arr = dijkstraGrid[x],
			arr2 = losGrid[x];
		for (var y = 0; y < gridHeight; y++) {
			arr[y] = null;
			arr2[y] = false;
		}
	}

	//Set all places where obstacles are as being weight MAXINT, which will stand for not able to go here
	for (var i = 0; i < obstacles.length; i++) {
		var t = obstacles[i];

		dijkstraGrid[t.x][t.y] = Number.MAX_VALUE;
	}

	//flood fill out from the end point
	var pathEnd = destination.Copy();
	pathEnd.Round();
	pathEnd.distance = 0;
	dijkstraGrid[pathEnd.x][pathEnd.y] = 0;
	losGrid[pathEnd.x][pathEnd.y] = true;

	var toVisit = [pathEnd];

	//for each node we need to visit, starting with the pathEnd
	for (i = 0; i < toVisit.length; i++) {
		var at = toVisit[i];

		//Calculate if we have LOS
		//Only need to see if don't have LOS if we aren't the end
		if (at !== pathEnd) {
			calculateLos(at, pathEnd);
		}

		var neighbours = straightNeighboursOf(at);

		//for each neighbour of this node (only straight line neighbours, not diagonals)
		for (var j = 0; j < neighbours.length; j++) {
			var n = neighbours[j];

			//We will only ever visit every node once as we are always visiting nodes in the most efficient order
			if (dijkstraGrid[n.x][n.y] === null) {
				n.distance = at.distance + 1;
				dijkstraGrid[n.x][n.y] = n.distance;
				toVisit.push(n);
			}
		}
	}
}

function calculateLos(at, pathEnd) {
	var xDif = pathEnd.x - at.x;
	var yDif = pathEnd.y - at.y;

	var xDifAbs = Math.abs(xDif);
	var yDifAbs = Math.abs(yDif);

	var hasLos = false;

	var xDifOne = Math.sign(xDif);
	var yDifOne = Math.sign(yDif);

	//Check the direction we are furtherest from the destination on (or both if equal)
	// If it has LOS then we might

	//Check in the x direction
	if (xDifAbs >= yDifAbs) {

		if (losGrid[at.x + xDifOne][at.y]) {
			hasLos = true;
		}
	}
	//Check in the y direction
	if (yDifAbs >= xDifAbs) {

		if (losGrid[at.x][at.y + yDifOne]) {
			hasLos = true;
		}
	}

	//If we are not a straight line vertically/horizontally to the exit
	if (yDifAbs > 0 && xDifAbs > 0) {
		//If the diagonal doesn't have LOS, we don't
		if (!losGrid[at.x + xDifOne][at.y + yDifOne]) {
			hasLos = false;
		} else if (yDifAbs === xDifAbs) {
			//If we are an exact diagonal and either straight direction is a wall, we don't have LOS
			if (dijkstraGrid[at.x + xDifOne][at.y] === Number.MAX_VALUE || dijkstraGrid[at.x][at.y + yDifOne] === Number.MAX_VALUE) {
				hasLos = false;
			}
		}
	}
	//It's a definite now
	losGrid[at.x][at.y] = hasLos;

	//TODO: Could replace our distance with a direct distance?
	// Might not be worth it, would need to use a priority queue for the open list.
}

function generateFlowField() {
	var x, y;

	//Generate an empty grid, set all places as Vector2.zero, which will stand for no good direction
	for (x = 0; x < gridWidth; x++) {
		var arr = flowField[x];
		for (y = 0; y < gridHeight; y++) {
			arr[y] = B2Vec2.Zero;
		}
	}

	//for each grid square
	for (x = 0; x < gridWidth; x++) {
		for (y = 0; y < gridHeight; y++) {

			//Obstacles have no flow value
			if (dijkstraGrid[x][y] == Number.MAX_VALUE) {
				continue;
			}

			if (losGrid[x][y]) {
				//Just point straight at the destination
				var p = flowField[x][y] = destination.Copy();
				p.x -= x;
				p.y -= y;
				p.Normalize();
				continue;
			}

			var pos = new B2Vec2(x, y);
			var neighbours = allNeighboursOf(pos);

			//Go through all neighbours and find the one with the lowest distance
			var min = null;
			var minDist = 0;
			for (var i = 0; i < neighbours.length; i++) {
				var n = neighbours[i];
				var dist = dijkstraGrid[n.x][n.y] - dijkstraGrid[pos.x][pos.y];

				if (dist < minDist) {
					min = n;
					minDist = dist;
				}
			}

			//If we found a valid neighbour, point in its direction
			if (min != null) {
				var v = min.Copy().Subtract(pos);
				v.Normalize();
				flowField[x][y] = v;
			}
		}
	}
}

function straightNeighboursOf(v) {
	var res = [];
	if (v.x > 0) {
		res.push(new B2Vec2(v.x - 1, v.y));
	}
	if (v.y > 0) {
		res.push(new B2Vec2(v.x, v.y - 1));
	}

	if (v.x < gridWidth - 1) {
		res.push(new B2Vec2(v.x + 1, v.y));
	}
	if (v.y < gridHeight - 1) {
		res.push(new B2Vec2(v.x, v.y + 1));
	}

	return res;
}

//Helper method. Returns true if this grid location is on the grid and not impassable
function isValid(x, y) {
	return x >= 0 && y >= 0 && x < gridWidth && y < gridHeight && dijkstraGrid[x][y] != Number.MAX_VALUE;
}

//Returns the non-obstructed neighbours of the given grid location.
//Diagonals are only included if their neighbours are also not obstructed
function allNeighboursOf(v) {
	var res = [],
		x = v.x,
		y = v.y;

	var up = isValid(x, y - 1),
		down = isValid(x, y + 1),
		left = isValid(x - 1, y),
		right = isValid(x + 1, y);

	//We test each straight direction, then subtest the next one clockwise

	if (left) {
		res.push(new B2Vec2(x - 1, y));

		//left up
		if (up && isValid(x - 1, y - 1)) {
			res.push(new B2Vec2(x - 1, y - 1));
		}
	}

	if (up) {
		res.push(new B2Vec2(x, y - 1));

		//up right
		if (right && isValid(x + 1, y - 1)) {
			res.push(new B2Vec2(x + 1, y - 1));
		}
	}

	if (right) {
		res.push(new B2Vec2(x + 1, y));

		//right down
		if (down && isValid(x + 1, y + 1)) {
			res.push(new B2Vec2(x + 1, y + 1));
		}
	}

	if (down) {
		res.push(new B2Vec2(x, y + 1));

		//down left
		if (left && isValid(x - 1, y + 1)) {
			res.push(new B2Vec2(x - 1, y + 1));
		}
	}

	return res;
}